<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\SiesaCredential;
use App\Models\User;
use App\Models\Notification;
use App\Support\AuditLogger;
use App\Support\UserProvisioner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

class UserController extends Controller
{
    public function __construct(private readonly UserProvisioner $provisioner)
    {
    }

    /**
     * Ensure the authenticated user is an administrator.
     */
    private function authorizeAdmin(Request $request, string ...$permissions): void
    {
        $this->authorizeSuite($request, ...$permissions);
    }

    /** Quien no es administrador total no puede crear, tocar ni ascender administradores. */
    private function guardEscalation(Request $request, ?User $target, array $validated = []): void
    {
        if ($request->user()->hasFullSuiteAccess()) {
            return;
        }
        abort_if($target?->hasFullSuiteAccess(), Response::HTTP_FORBIDDEN, 'Solo un administrador puede modificar a otro administrador');
        abort_if(!empty($validated['is_admin']), Response::HTTP_FORBIDDEN, 'Solo un administrador puede otorgar acceso total');
        if (!empty($validated['role_id'])) {
            abort_if((bool) Role::find($validated['role_id'])?->is_admin, Response::HTTP_FORBIDDEN, 'Solo un administrador puede asignar un grupo con acceso total');
        }
    }

    /**
     * List all users with their role, status, app access and Siesa state.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request, 'users');

        $siesaUserIds = SiesaCredential::query()->pluck('user_id')->all();

        $users = User::query()
            ->with(['applications:id', 'role:id,name,color'])
            ->orderBy('name')
            ->get(['id', 'name', 'cedula', 'email', 'is_active', 'is_admin', 'role_id', 'face_descriptor', 'face_enrolled_at', 'face_bypass_until'])
            ->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'cedula' => $user->cedula,
                'email' => $user->email,
                'is_active' => (bool) $user->is_active,
                'is_admin' => (bool) $user->is_admin,
                'role_id' => $user->role_id,
                'role_name' => $user->role->name ?? null,
                'has_siesa' => in_array($user->id, $siesaUserIds, true),
                'application_ids' => $user->applications->pluck('id')->values(),
                'has_face' => !empty($user->face_descriptor),
                'face_enrolled_at' => $user->face_enrolled_at?->toIso8601String(),
                'face_bypass_until' => $user->face_bypass_until?->toIso8601String(),
            ]);

        return response()->json($users);
    }

    /**
     * Create a user (with its Siesa credentials and optional app access).
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request, 'users.create');

        $validated = $request->validate([
            'name' => 'required|string|max:190',
            'cedula' => 'required|string|max:50|unique:users,cedula',
            'email' => 'nullable|email|max:190|unique:users,email',
            'password' => 'required|string|min:6|max:190',
            'is_admin' => 'boolean',
            'is_active' => 'boolean',
            'role_id' => 'nullable|integer|exists:roles,id',
            'application_ids' => 'nullable|array',
            'application_ids.*' => 'integer|exists:applications,id',
            'app_access' => 'nullable|array',
            'app_access.*.application_id' => 'required|integer|exists:applications,id',
            'app_access.*.role' => 'nullable|string|max:190',
            'app_access.*.permissions' => 'nullable|array',
            'app_access.*.permissions.*' => 'string',
            'app_access.*.abilities' => 'nullable|array',
            'app_access.*.abilities.*' => 'string',
            'siesa_username' => 'nullable|string|max:190',
            'siesa_password' => 'nullable|string|max:190',
            'siesa_domain' => 'nullable|string|max:190',
        ]);

        $this->guardEscalation($request, null, $validated);

        $role = !empty($validated['role_id']) ? Role::find($validated['role_id']) : null;

        $user = User::create([
            'name' => $validated['name'],
            'cedula' => $validated['cedula'],
            'email' => $validated['email'] ?? null,
            'password' => $validated['password'],
            'is_admin' => $validated['is_admin'] ?? ($role?->is_admin ?? false),
            'is_active' => $validated['is_active'] ?? true,
            'role_id' => $validated['role_id'] ?? null,
        ]);

        // Onboarding: si no se especifican apps pero hay rol, aplica su preset.
        if (!empty($validated['app_access'])) {
            $sync = $this->buildAppAccessSync($validated['app_access']);
        } else {
            $sync = $this->buildAccessSync($validated['application_ids'] ?? null, $role);
        }
        $user->applications()->sync($sync);

        // Notificación de bienvenida al nuevo usuario
        Notification::dispatch(
            'user_created',
            '¡Bienvenido/a a la suite!',
            "Tu cuenta fue creada. Usuario: {$user->cedula}",
            $user->id,
        );

        // El acceso es por cédula; las credenciales Siesa son opcionales.
        if (!empty($validated['siesa_username'])) {
            SiesaCredential::updateOrCreate(
                ['user_id' => $user->id],
                [
                    'username' => $validated['siesa_username'],
                    'password' => $validated['siesa_password'] ?? '',
                    'domain' => $validated['siesa_domain'] ?? 'awssiesacloud',
                ]
            );
        }

        AuditLogger::record($request, 'user.created', 'user', $user->id, "Usuario creado: {$user->name}");

        // Refleja el usuario (con su contraseña) en las apps externas habilitadas.
        $this->provisioner->syncUser($user->fresh(['applications']), $validated['password']);

        return response()->json($this->present($user), Response::HTTP_CREATED);
    }

    /**
     * Update a user. Password and Siesa credentials are optional on edit.
     */
    public function update(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdmin($request, 'users.edit');

        $validated = $request->validate([
            'name' => 'required|string|max:190',
            'cedula' => ['required', 'string', 'max:50', Rule::unique('users', 'cedula')->ignore($user->id)],
            'email' => ['nullable', 'email', 'max:190', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => 'nullable|string|min:6|max:190',
            'is_admin' => 'boolean',
            'is_active' => 'boolean',
            'role_id' => 'nullable|integer|exists:roles,id',
            'application_ids' => 'nullable|array',
            'application_ids.*' => 'integer|exists:applications,id',
            'app_access' => 'nullable|array',
            'app_access.*.application_id' => 'required|integer|exists:applications,id',
            'app_access.*.role' => 'nullable|string|max:190',
            'app_access.*.permissions' => 'nullable|array',
            'app_access.*.permissions.*' => 'string',
            'app_access.*.abilities' => 'nullable|array',
            'app_access.*.abilities.*' => 'string',
            'siesa_username' => 'nullable|string|max:190',
            'siesa_password' => 'nullable|string|max:190',
            'siesa_domain' => 'nullable|string|max:190',
        ]);

        $this->guardEscalation($request, $user, $validated);

        // Evita que un administrador se bloquee a sí mismo.
        if ($user->id === $request->user()->id) {
            if (array_key_exists('is_admin', $validated) && !$validated['is_admin']) {
                abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'No puedes quitarte a ti mismo el rol de administrador.');
            }
            if (array_key_exists('is_active', $validated) && !$validated['is_active']) {
                abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'No puedes desactivar tu propio usuario.');
            }
        }

        $user->name = $validated['name'];
        $user->cedula = $validated['cedula'];
        $user->email = $validated['email'] ?? null;
        if (!empty($validated['password'])) {
            $user->password = $validated['password'];
        }
        if (array_key_exists('is_admin', $validated)) {
            $user->is_admin = $validated['is_admin'];
        }
        if (array_key_exists('is_active', $validated)) {
            $user->is_active = $validated['is_active'];
        }
        if (array_key_exists('role_id', $validated)) {
            $user->role_id = $validated['role_id'];
        }
        $user->save();

        $previousAppIds = $user->applications()->pluck('applications.id')->all();

        if (array_key_exists('app_access', $validated) && $validated['app_access'] !== null) {
            $user->applications()->sync($this->buildAppAccessSync($validated['app_access']));
        } elseif (array_key_exists('application_ids', $validated)) {
            // Conserva las habilidades ya otorgadas; agrega "view" a las nuevas.
            $existing = $user->applications()->get()
                ->mapWithKeys(fn ($a) => [$a->id => ['abilities' => $a->pivot->abilities ?? json_encode(['view'])]]);
            $sync = [];
            foreach ($validated['application_ids'] ?? [] as $appId) {
                $appId = (int) $appId;
                $sync[$appId] = $existing[$appId] ?? ['abilities' => json_encode(['view'])];
            }
            $user->applications()->sync($sync);
        }

        // Solo se actualizan las credenciales de Siesa si vienen ambas.
        if (!empty($validated['siesa_username']) && !empty($validated['siesa_password'])) {
            SiesaCredential::updateOrCreate(
                ['user_id' => $user->id],
                [
                    'username' => $validated['siesa_username'],
                    'password' => $validated['siesa_password'],
                    'domain' => $validated['siesa_domain'] ?? 'awssiesacloud',
                ]
            );
        }

        AuditLogger::record($request, 'user.updated', 'user', $user->id, "Usuario actualizado: {$user->name}");

        // Refleja los cambios (estado, rol, permisos y contraseña si cambió) en
        // las apps externas, y bloquea las apps a las que se le quitó el acceso.
        $fresh = $user->fresh(['applications']);
        $this->provisioner->syncUser($fresh, $validated['password'] ?? null);
        $currentAppIds = $fresh->applications()->pluck('applications.id')->all();
        $this->provisioner->blockApplications($fresh, array_values(array_diff($previousAppIds, $currentAppIds)));

        return response()->json($this->present($user->fresh()));
    }

    /**
     * Delete a user (its Siesa credential cascades).
     */
    public function destroy(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdmin($request, 'users.delete');
        $this->guardEscalation($request, $user);

        if ($user->id === $request->user()->id) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'No puedes eliminar tu propio usuario.');
        }

        // Antes de borrar en la suite, bloquea y desactiva en las apps externas
        // para no dejar cuentas activas huérfanas.
        $this->provisioner->blockEverywhere($user->loadMissing('applications'));

        $user->tokens()->delete();
        $user->delete();

        AuditLogger::record($request, 'user.deleted', 'user', $user->id, "Usuario eliminado: {$user->name}");

        return response()->json(['message' => 'Usuario eliminado']);
    }

    /**
     * Enrola (o reemplaza) el rostro de un usuario. Se reciben una o varias
     * muestras de descriptores (128 floats cada una) calculadas en el navegador.
     */
    public function enrollFace(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdmin($request, 'users.face');

        $validated = $request->validate([
            'descriptors' => 'required|array|min:1|max:5',
            'descriptors.*' => 'array|size:128',
            'descriptors.*.*' => 'numeric',
        ]);

        $user->face_descriptor = array_values($validated['descriptors']);
        $user->setAttribute('face_enrolled_at', now());
        $user->save();

        AuditLogger::record($request, 'user.face_enrolled', 'user', $user->id, "Rostro enrolado: {$user->name}");

        return response()->json($this->present($user->fresh()));
    }

    /**
     * Elimina el rostro enrolado de un usuario.
     */
    public function removeFace(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdmin($request, 'users.face');

        $user->face_descriptor = null;
        $user->face_enrolled_at = null;
        $user->save();

        AuditLogger::record($request, 'user.face_removed', 'user', $user->id, "Rostro eliminado: {$user->name}");

        return response()->json($this->present($user->fresh()));
    }

    /**
     * Otorga un bypass temporal del factor facial (p. ej. si la cámara falla o
     * el usuario aún no está enrolado). Duración en minutos.
     */
    public function grantFaceBypass(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdmin($request, 'users.face');

        $validated = $request->validate([
            'minutes' => 'required|integer|min:5|max:10080',
        ]);

        $user->setAttribute('face_bypass_until', now()->addMinutes($validated['minutes']));
        $user->save();

        AuditLogger::record($request, 'user.face_bypass_granted', 'user', $user->id, "Bypass facial por {$validated['minutes']} min: {$user->name}");

        return response()->json($this->present($user->fresh()));
    }

    /**
     * Revoca el bypass temporal del factor facial.
     */
    public function revokeFaceBypass(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdmin($request, 'users.face');

        $user->face_bypass_until = null;
        $user->save();

        AuditLogger::record($request, 'user.face_bypass_revoked', 'user', $user->id, "Bypass facial revocado: {$user->name}");

        return response()->json($this->present($user->fresh()));
    }

    /**
     * Shape a user for the API response.
     */
    private function present(User $user): array
    {
        $user->loadMissing('role:id,name,color');

        return [
            'id' => $user->id,
            'name' => $user->name,
            'cedula' => $user->cedula,
            'email' => $user->email,
            'is_active' => (bool) $user->is_active,
            'is_admin' => (bool) $user->is_admin,
            'role_id' => $user->role_id,
            'role_name' => $user->role->name ?? null,
            'has_siesa' => SiesaCredential::where('user_id', $user->id)->exists(),
            'application_ids' => $user->applications()->pluck('applications.id')->values(),
            'has_face' => !empty($user->face_descriptor),
            'face_enrolled_at' => $user->face_enrolled_at?->toIso8601String(),
            'face_bypass_until' => $user->face_bypass_until?->toIso8601String(),
        ];
    }

    /**
     * Build the pivot sync payload from an explicit per-app access list
     * (application_id + optional app role, module permissions and abilities).
     *
     * @param  array<int,array<string,mixed>>  $appAccess
     */
    private function buildAppAccessSync(array $appAccess): array
    {
        $sync = [];

        foreach ($appAccess as $entry) {
            $appId = (int) ($entry['application_id'] ?? 0);
            if ($appId <= 0) {
                continue;
            }

            $abilities = array_values(array_intersect(
                (array) ($entry['abilities'] ?? []),
                \App\Models\Application::ABILITIES
            ));
            if (!in_array('view', $abilities, true)) {
                array_unshift($abilities, 'view');
            }

            $role = $entry['role'] ?? null;
            $permissions = array_values(array_unique(array_map('strval', (array) ($entry['permissions'] ?? []))));

            $sync[$appId] = [
                'abilities' => json_encode($abilities),
                'app_role' => $role !== null && $role !== '' ? (string) $role : null,
                'app_permissions' => json_encode($permissions),
            ];
        }

        return $sync;
    }

    /**
     * Build the applications sync payload, applying a role preset when no
     * explicit apps are provided (onboarding).
     *
     * @param  array<int>|null  $applicationIds
     */
    private function buildAccessSync(?array $applicationIds, ?Role $role): array
    {
        $sync = [];

        if ($applicationIds !== null && count($applicationIds) > 0) {
            foreach ($applicationIds as $appId) {
                $sync[(int) $appId] = ['abilities' => json_encode(['view'])];
            }

            return $sync;
        }

        // Sin apps explícitas: usa el preset del rol si existe.
        if ($role) {
            $roleAbilities = $role->abilities ?? [];
            foreach ($role->app_ids ?? [] as $appId) {
                $appId = (int) $appId;
                $abilities = $roleAbilities[$appId] ?? $roleAbilities[(string) $appId] ?? ['view'];
                $sync[$appId] = ['abilities' => json_encode(array_values($abilities))];
            }
        }

        return $sync;
    }
}
