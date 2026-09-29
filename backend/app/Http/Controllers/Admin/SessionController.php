<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\LoginLog;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

class SessionController extends Controller
{
    private function authorizeAdmin(Request $request, string ...$permissions): void
    {
        $this->authorizeSuite($request, ...$permissions);
    }

    /**
     * Active sessions (personal access tokens) grouped across all users.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request, 'sessions');

        $tokens = PersonalAccessToken::query()
            ->with('tokenable:id,name,cedula,role_id,is_admin', 'tokenable.role:id,name')
            ->latest('last_used_at')
            ->latest('created_at')
            ->get();

        // Último login exitoso por usuario para mostrar navegador/SO/IP.
        $logins = LoginLog::query()
            ->whereIn('user_id', $tokens->pluck('tokenable_id')->unique())
            ->where('status', 'success')
            ->orderByDesc('id')
            ->get(['user_id', 'browser', 'os', 'device_type', 'ip_address'])
            ->unique('user_id')
            ->keyBy('user_id');

        $tokens = $tokens->map(fn (PersonalAccessToken $token) => array_merge($this->present($token), [
            'role' => $token->tokenable?->is_admin ? 'Administrador' : ($token->tokenable->role->name ?? null),
            'browser' => $logins[$token->tokenable_id]->browser ?? null,
            'os' => $logins[$token->tokenable_id]->os ?? null,
            'device_type' => $logins[$token->tokenable_id]->device_type ?? null,
            'ip_address' => $logins[$token->tokenable_id]->ip_address ?? null,
            'is_current' => $token->id === ($request->user()->currentAccessToken()->id ?? null),
        ]));

        return response()->json($tokens->values());
    }

    /**
     * Active sessions for a specific user.
     */
    public function forUser(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdmin($request, 'sessions', 'users');

        $tokens = $user->tokens()
            ->latest('last_used_at')
            ->get()
            ->map(fn (PersonalAccessToken $token) => $this->present($token));

        return response()->json($tokens->values());
    }

    /**
     * Revoke (delete) a specific session token.
     */
    public function revoke(Request $request, int $token): JsonResponse
    {
        $this->authorizeAdmin($request, 'sessions.revoke');

        $model = PersonalAccessToken::with('tokenable:id,name')->findOrFail($token);
        abort_if($model->id === ($request->user()->currentAccessToken()->id ?? null), Response::HTTP_UNPROCESSABLE_ENTITY, 'No puedes revocar tu propia sesión actual');
        $ownerName = $model->tokenable->name ?? null;
        $model->delete();

        AuditLogger::record(
            $request,
            'session.revoked',
            'user',
            $model->tokenable_id,
            "Sesión revocada de {$ownerName}"
        );

        return response()->json(['message' => 'Sesión revocada']);
    }

    /**
     * The authenticated user's own active sessions.
     */
    public function mine(Request $request): JsonResponse
    {
        $currentId = $request->user()->currentAccessToken()->id ?? null;

        $tokens = $request->user()->tokens()
            ->latest('last_used_at')
            ->get()
            ->map(fn (PersonalAccessToken $token) => array_merge(
                $this->present($token),
                ['current' => $token->id === $currentId]
            ));

        return response()->json($tokens->values());
    }

    private function present(PersonalAccessToken $token): array
    {
        return [
            'id' => $token->id,
            'user' => $token->tokenable->name ?? null,
            'user_id' => $token->tokenable_id,
            'name' => $token->name,
            'last_used_at' => $token->last_used_at?->toIso8601String(),
            'created_at' => $token->created_at?->toIso8601String(),
        ];
    }
}
