<?php

use App\Http\Controllers\Admin\AnnouncementController;
use App\Http\Controllers\Admin\ApplicationController as AdminApplicationController;
use App\Http\Controllers\Admin\AuditController;
use App\Http\Controllers\Admin\CrossDashboardController;
use App\Http\Controllers\Admin\PresenceController as AdminPresenceController;
use App\Http\Controllers\Admin\RoleController;
use App\Http\Controllers\Admin\ServiceHealthController;
use App\Http\Controllers\Admin\SessionController;
use App\Http\Controllers\Admin\StatsController;
use App\Http\Controllers\Admin\UserAccessController;
use App\Http\Controllers\Admin\UserController as AdminUserController;
use App\Http\Controllers\ApplicationController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PresenceController;
use App\Http\Controllers\SiesaCredentialController;
use App\Http\Controllers\SsoController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Public
Route::post('/auth/login', [AuthController::class, 'login']);
// Segundo paso del login: verificación facial (biometría 2FA).
Route::post('/auth/login/face', [AuthController::class, 'loginFace']);
// Recuperación de contraseña por correo (enlace de un solo uso).
Route::post('/auth/forgot-password', [AuthController::class, 'forgotPassword']);
Route::post('/auth/reset-password', [AuthController::class, 'resetPassword']);

Route::get('/health', function () {
    return response()->json(['status' => 'ok', 'message' => 'Santa Cruz Suite API running']);
});

// SSO: canje de ticket server-to-server (protegido por secreto compartido en el controlador)
Route::post('/sso/redeem', [SsoController::class, 'redeem']);

// Protected
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    // El usuario puede cambiar su propia contraseña.
    Route::put('/auth/password', [AuthController::class, 'updatePassword']);
    // Historial de accesos del propio usuario.
    Route::get('/auth/my-logins', [AuthController::class, 'myLogins']);
    // Sesiones activas del propio usuario.
    Route::get('/auth/sessions', [SessionController::class, 'mine']);

    // Presencia (monitoreo propio, con consentimiento).
    Route::get('/presence/me', [PresenceController::class, 'me']);
    Route::post('/presence/heartbeat', [PresenceController::class, 'heartbeat']);
    Route::post('/presence/consent', [PresenceController::class, 'consent']);

    // Catálogo de aplicaciones a las que el usuario tiene acceso
    Route::get('/applications', [ApplicationController::class, 'index']);

    // Notificaciones del usuario (propias + broadcast)
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::put('/notifications/{notification}/read', [NotificationController::class, 'markRead']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);

    // Anuncios activos no vistos por el usuario
    Route::get('/announcements/active', [AnnouncementController::class, 'active']);
    Route::post('/announcements/{announcement}/viewed', [AnnouncementController::class, 'markViewed']);

    // Genera un ticket SSO de un solo uso para abrir una app externa
    Route::post('/sso/ticket', [SsoController::class, 'ticket']);

    // Bóveda de credenciales de Siesa (por usuario, cifradas)
    Route::get('/siesa/credentials', [SiesaCredentialController::class, 'show']);
    Route::post('/siesa/credentials', [SiesaCredentialController::class, 'store']);
    Route::delete('/siesa/credentials', [SiesaCredentialController::class, 'destroy']);
    // Usada por la extensión del navegador para autocompletar el login de Siesa
    Route::get('/siesa/credentials/reveal', [SiesaCredentialController::class, 'reveal']);
    // Auto-login puro (sin extensión): datos para armar el cliente HTML5 de Siesa
    Route::get('/siesa/launch', [SiesaCredentialController::class, 'launch']);

    // Administración de permisos (solo admin)
    Route::prefix('admin')->group(function () {
        // Dashboard de estadísticas de la suite (solo admin)
        Route::get('/stats', [StatsController::class, 'index']);
        Route::get('/stats/export', [StatsController::class, 'export']);

        // Bitácora de auditoría
        Route::get('/audit', [AuditController::class, 'index']);
        Route::get('/audit/actions', [AuditController::class, 'actions']);

        // Sesiones activas (tokens Sanctum)
        Route::get('/sessions', [SessionController::class, 'index']);
        Route::get('/users/{user}/sessions', [SessionController::class, 'forUser']);
        Route::delete('/sessions/{token}', [SessionController::class, 'revoke']);

        // Estado de servicios (health checks de las apps)
        Route::get('/services/health', [ServiceHealthController::class, 'index']);

        // Presencia (tablero de administración)
        Route::get('/presence', [AdminPresenceController::class, 'index']);
        Route::get('/presence/monthly', [AdminPresenceController::class, 'monthly']);
        Route::get('/presence/export', [AdminPresenceController::class, 'export']);

        // Roles / grupos
        Route::get('/roles', [RoleController::class, 'index']);
        Route::post('/roles', [RoleController::class, 'store']);
        Route::put('/roles/{role}', [RoleController::class, 'update']);
        Route::delete('/roles/{role}', [RoleController::class, 'destroy']);

        Route::get('/users', [UserAccessController::class, 'users']);
        Route::get('/applications', [UserAccessController::class, 'applications']);
        Route::get('/applications/{application}/catalog', [UserAccessController::class, 'catalog']);
        Route::post('/provisioning/import', [UserAccessController::class, 'import']);
        Route::get('/users/{user}/applications', [UserAccessController::class, 'show']);
        Route::post('/users/{user}/applications/refresh', [UserAccessController::class, 'refresh']);
        Route::put('/users/{user}/applications', [UserAccessController::class, 'update']);

        // Gestión de usuarios (CRUD, solo admin)
        Route::get('/manage/users', [AdminUserController::class, 'index']);
        Route::post('/manage/users', [AdminUserController::class, 'store']);
        Route::put('/manage/users/{user}', [AdminUserController::class, 'update']);
        Route::delete('/manage/users/{user}', [AdminUserController::class, 'destroy']);

        // Biometría facial (2FA) por usuario (solo admin)
        Route::post('/manage/users/{user}/face', [AdminUserController::class, 'enrollFace']);
        Route::delete('/manage/users/{user}/face', [AdminUserController::class, 'removeFace']);
        Route::post('/manage/users/{user}/face-bypass', [AdminUserController::class, 'grantFaceBypass']);
        Route::delete('/manage/users/{user}/face-bypass', [AdminUserController::class, 'revokeFaceBypass']);

        // Gestión de aplicaciones (CRUD, solo admin)
        Route::get('/manage/applications', [AdminApplicationController::class, 'index']);
        Route::post('/manage/applications', [AdminApplicationController::class, 'store']);
        Route::put('/manage/applications/{application}', [AdminApplicationController::class, 'update']);
        Route::delete('/manage/applications/{application}', [AdminApplicationController::class, 'destroy']);

        // Resúmenes ejecutivos de apps externas (proxy con SSO secret)
        Route::get('/cross/sigcom', [CrossDashboardController::class, 'sigcom']);
        Route::get('/cross/sigcompro', [CrossDashboardController::class, 'sigcompro']);

        // Anuncios internos (CRUD admin)
        Route::get('/announcements', [AnnouncementController::class, 'index']);
        Route::post('/announcements', [AnnouncementController::class, 'store']);
        Route::put('/announcements/{announcement}', [AnnouncementController::class, 'update']);
        Route::delete('/announcements/{announcement}', [AnnouncementController::class, 'destroy']);
    });
});
