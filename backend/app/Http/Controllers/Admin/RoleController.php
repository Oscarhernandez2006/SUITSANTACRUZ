<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Support\AuditLogger;
use App\Support\SuitePermissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

class RoleController extends Controller
{
    private function authorizeAdmin(Request $request, string ...$permissions): void
    {
        $this->authorizeSuite($request, ...$permissions);
    }

    /** Catálogo de módulos/acciones de la Suite para el editor de grupos. */
    public function catalog(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request, 'roles');

        return response()->json(['groups' => SuitePermissions::CATALOG, 'defaults' => SuitePermissions::DEFAULTS]);
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request, 'roles', 'users');

        $roles = Role::query()
            ->withCount('users')
            ->orderBy('name')
            ->get()
            ->map(fn (Role $role) => $this->present($role));

        return response()->json($roles);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request, 'roles.create');

        $data = $this->validateData($request);
        $data['slug'] = $this->uniqueSlug($data['name']);

        $role = Role::create($data);

        AuditLogger::record($request, 'role.created', 'role', $role->id, "Rol creado: {$role->name}");

        return response()->json($this->present($role->loadCount('users')), Response::HTTP_CREATED);
    }

    public function update(Request $request, Role $role): JsonResponse
    {
        $this->authorizeAdmin($request, 'roles.edit');
        abort_if($role->is_admin && !$request->user()->hasFullSuiteAccess(), Response::HTTP_FORBIDDEN, 'Solo un administrador puede editar un grupo con acceso total');

        $data = $this->validateData($request);
        $role->update($data);

        AuditLogger::record($request, 'role.updated', 'role', $role->id, "Rol actualizado: {$role->name}");

        return response()->json($this->present($role->loadCount('users')));
    }

    public function destroy(Request $request, Role $role): JsonResponse
    {
        $this->authorizeAdmin($request, 'roles.delete');
        abort_if($role->isSystem(), Response::HTTP_UNPROCESSABLE_ENTITY, 'Los grupos del sistema no se pueden eliminar');
        abort_if($role->is_admin && !$request->user()->hasFullSuiteAccess(), Response::HTTP_FORBIDDEN, 'Solo un administrador puede eliminar un grupo con acceso total');

        $name = $role->name;
        $role->delete();

        AuditLogger::record($request, 'role.deleted', 'role', $role->id, "Rol eliminado: {$name}");

        return response()->json(['message' => 'Rol eliminado']);
    }

    private function validateData(Request $request): array
    {
        $validated = $request->validate([
            'name' => 'required|string|max:120',
            'description' => 'nullable|string|max:255',
            'color' => 'nullable|string|max:20',
            'is_admin' => 'boolean',
            'permissions' => 'nullable|array',
            'permissions.*' => 'string|max:60',
        ]);

        $actor = $request->user();
        $isAdmin = (bool) ($validated['is_admin'] ?? false);
        $permissions = SuitePermissions::normalize((array) ($validated['permissions'] ?? []));

        // Nadie puede otorgar más de lo que él mismo tiene.
        if (!$actor->hasFullSuiteAccess()) {
            abort_if($isAdmin, Response::HTTP_FORBIDDEN, 'Solo un administrador puede crear grupos con acceso total');
            $extra = array_diff($permissions, $actor->suitePermissions());
            abort_if($extra !== [], Response::HTTP_FORBIDDEN, 'No puedes otorgar permisos que no tienes');
        }

        return [
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'color' => $validated['color'] ?? null,
            'is_admin' => $isAdmin,
            'permissions' => $isAdmin ? SuitePermissions::all() : $permissions,
        ];
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'rol';
        $slug = $base;
        $i = 2;
        while (Role::where('slug', $slug)->exists()) {
            $slug = "{$base}-{$i}";
            $i++;
        }

        return $slug;
    }

    private function present(Role $role): array
    {
        return [
            'id' => $role->id,
            'name' => $role->name,
            'slug' => $role->slug,
            'description' => $role->description,
            'color' => $role->color,
            'is_admin' => (bool) $role->is_admin,
            'is_system' => $role->isSystem(),
            'permissions' => $role->is_admin
                ? SuitePermissions::all()
                : SuitePermissions::normalize((array) ($role->permissions ?? [])),
            'users_count' => (int) ($role->users_count ?? 0),
        ];
    }
}
