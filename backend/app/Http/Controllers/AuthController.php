<?php

namespace App\Http\Controllers;

use App\Mail\PasswordResetMail;
use App\Models\LoginLog;
use App\Models\SiesaCredential;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    /** Minutos de validez del enlace de recuperación de contraseña. */
    private const RESET_TOKEN_TTL_MINUTES = 60;

    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'cedula' => 'required|string',
            'password' => 'required|string',
            'latitude' => 'nullable|numeric',
            'longitude' => 'nullable|numeric',
        ]);

        $clientInfo = $this->extractClientInfo($request);
        $user = User::where('cedula', $request->cedula)->first();

        // Failed: user not found or wrong password
        if (!$user || !Hash::check($request->password, $user->password)) {
            LoginLog::create([
                'user_id' => $user?->id,
                'cedula' => $request->cedula,
                'status' => 'failed',
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'browser' => $clientInfo['browser'],
                'device_type' => $clientInfo['device_type'],
                'os' => $clientInfo['os'],
                'latitude' => $request->latitude,
                'longitude' => $request->longitude,
            ]);

            return response()->json([
                'message' => 'Credenciales incorrectas',
            ], 401);
        }

        // Failed: user inactive
        if (!$user->is_active) {
            LoginLog::create([
                'user_id' => $user->id,
                'cedula' => $request->cedula,
                'status' => 'failed',
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'browser' => $clientInfo['browser'],
                'device_type' => $clientInfo['device_type'],
                'os' => $clientInfo['os'],
                'latitude' => $request->latitude,
                'longitude' => $request->longitude,
            ]);

            return response()->json([
                'message' => 'Usuario inactivo. Contacte al administrador.',
            ], 403);
        }

        // Password correcto. Determina si se exige el segundo factor facial.
        // Regla actual: se exige a todos los usuarios NO administradores que no
        // tengan un bypass temporal vigente.
        if (!$user->is_admin && !$this->hasActiveBypass($user)) {
            if (empty($user->face_descriptor)) {
                // No hay rostro enrolado ni bypass: no puede continuar.
                LoginLog::create([
                    'user_id' => $user->id,
                    'cedula' => $request->cedula,
                    'status' => 'failed',
                    'ip_address' => $request->ip(),
                    'user_agent' => $request->userAgent(),
                    'browser' => $clientInfo['browser'],
                    'device_type' => $clientInfo['device_type'],
                    'os' => $clientInfo['os'],
                    'latitude' => $request->latitude,
                    'longitude' => $request->longitude,
                ]);

                return response()->json([
                    'message' => 'Tu rostro aún no está registrado. Contacta al administrador para activar tu acceso.',
                    'face_status' => 'not_enrolled',
                ], 403);
            }

            // Reto de verificación de corta duración. NO se emite el token de
            // acceso todavía: el cliente debe superar el paso facial.
            $challenge = Crypt::encryptString(json_encode([
                'uid' => $user->id,
                'exp' => now()->addMinutes(5)->timestamp,
            ]));

            return response()->json([
                'message' => 'Verificación facial requerida',
                'face_required' => true,
                'challenge' => $challenge,
                'user_name' => $user->name,
            ]);
        }

        // Admin o con bypass vigente: acceso directo.
        return $this->issueToken($user, $request, $clientInfo);
    }

    /**
     * Segundo paso del login: verifica el rostro capturado en vivo contra el
     * descriptor enrolado del usuario y, si coincide, emite el token.
     */
    public function loginFace(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'challenge' => 'required|string',
            'descriptor' => 'required|array|size:128',
            'descriptor.*' => 'numeric',
            'latitude' => 'nullable|numeric',
            'longitude' => 'nullable|numeric',
        ]);

        try {
            $payload = json_decode(Crypt::decryptString($validated['challenge']), true);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Sesión de verificación inválida. Vuelve a iniciar sesión.'], 422);
        }

        if (!is_array($payload) || ($payload['exp'] ?? 0) < now()->timestamp) {
            return response()->json(['message' => 'La verificación expiró. Vuelve a iniciar sesión.'], 422);
        }

        $user = User::find($payload['uid'] ?? null);
        if (!$user || !$user->is_active) {
            return response()->json(['message' => 'Usuario no válido.'], 401);
        }

        $clientInfo = $this->extractClientInfo($request);
        $distance = $this->minFaceDistance($user->face_descriptor, $validated['descriptor']);

        // Umbral típico de face-api.js: <0.6 coincide; usamos 0.5 (más estricto).
        $threshold = (float) env('FACE_MATCH_THRESHOLD', 0.5);

        if ($distance === null || $distance > $threshold) {
            LoginLog::create([
                'user_id' => $user->id,
                'cedula' => $user->cedula,
                'status' => 'failed',
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'browser' => $clientInfo['browser'],
                'device_type' => $clientInfo['device_type'],
                'os' => $clientInfo['os'],
                'latitude' => $validated['latitude'] ?? null,
                'longitude' => $validated['longitude'] ?? null,
            ]);

            return response()->json([
                'message' => 'No pudimos verificar tu rostro. Intenta de nuevo.',
                'face_status' => 'no_match',
            ], 401);
        }

        return $this->issueToken($user, $request, $clientInfo);
    }

    /**
     * Emite el token de acceso y registra el login exitoso. Compartido por el
     * login directo (admin/bypass) y por la verificación facial.
     */
    private function issueToken(User $user, Request $request, array $clientInfo): JsonResponse
    {
        LoginLog::create([
            'user_id' => $user->id,
            'cedula' => $user->cedula,
            'status' => 'success',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'browser' => $clientInfo['browser'],
            'device_type' => $clientInfo['device_type'],
            'os' => $clientInfo['os'],
            'latitude' => $request->latitude,
            'longitude' => $request->longitude,
        ]);

        // Revoke previous tokens and create a new one
        $user->tokens()->delete();
        $token = $user->createToken('sc-tools')->plainTextToken;

        return response()->json([
            'message' => 'Inicio de sesión exitoso',
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'cedula' => $user->cedula,
                'email' => $user->email,
                'is_admin' => $user->is_admin,
            ],
            // Se envía el estado de Siesa aquí para evitar una petición extra al cargar el portal.
            'siesa' => $this->siesaStatus($user),
        ]);
    }

    /**
     * ¿El usuario tiene un bypass temporal del factor facial vigente?
     */
    private function hasActiveBypass(User $user): bool
    {
        return $user->face_bypass_until !== null && $user->face_bypass_until->isFuture();
    }

    /**
     * Menor distancia euclidiana entre el descriptor en vivo y los enrolados.
     * `$stored` puede ser un vector (128) o una lista de vectores.
     *
     * @param  array<int, float>|array<int, array<int, float>>|null  $stored
     * @param  array<int, float>  $live
     */
    private function minFaceDistance(?array $stored, array $live): ?float
    {
        if (empty($stored)) {
            return null;
        }

        // Normaliza a lista de muestras.
        $muestras = isset($stored[0]) && is_array($stored[0]) ? $stored : [$stored];

        $min = null;
        foreach ($muestras as $muestra) {
            if (!is_array($muestra) || count($muestra) !== count($live)) {
                continue;
            }
            $suma = 0.0;
            foreach ($live as $i => $v) {
                $d = ((float) $v) - ((float) $muestra[$i]);
                $suma += $d * $d;
            }
            $dist = sqrt($suma);
            if ($min === null || $dist < $min) {
                $min = $dist;
            }
        }

        return $min;
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Sesión cerrada']);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'id' => $user->id,
            'name' => $user->name,
            'cedula' => $user->cedula,
            'email' => $user->email,
            'is_admin' => $user->is_admin,
            'siesa' => $this->siesaStatus($user),
        ]);
    }

    /**
     * Estado (sin contraseña) de las credenciales de Siesa del usuario.
     */
    private function siesaStatus(User $user): array
    {
        $cred = SiesaCredential::where('user_id', $user->id)->first();

        return [
            'has_credentials' => (bool) $cred,
            'domain' => $cred->domain ?? 'awssiesacloud',
            'username' => $cred->username ?? null,
        ];
    }

    /**
     * Permite al usuario autenticado cambiar su propia contraseña.
     */
    public function updatePassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'current_password' => 'required|string',
            'password' => 'required|string|min:6|confirmed',
        ]);

        $user = $request->user();

        if (!Hash::check($validated['current_password'], $user->password)) {
            return response()->json(['message' => 'La contraseña actual es incorrecta'], 422);
        }

        $user->password = $validated['password'];
        $user->save();

        return response()->json(['message' => 'Contraseña actualizada correctamente']);
    }

    /**
     * Paso 1 de la recuperación: el usuario ingresa su correo. Si existe una
     * cuenta activa con ese email, se genera un token de un solo uso y se envía
     * un enlace de restablecimiento. La respuesta es siempre genérica para no
     * revelar qué correos están registrados (evita enumeración de usuarios).
     */
    public function forgotPassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => 'required|email',
        ]);

        $genericMessage = 'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.';

        $email = mb_strtolower(trim($validated['email']));
        $user = User::whereRaw('LOWER(email) = ?', [$email])->first();

        // No revelamos si el correo existe o si la cuenta está inactiva.
        if (!$user || !$user->is_active) {
            return response()->json(['message' => $genericMessage]);
        }

        // Token en claro para el enlace; en la tabla se guarda solo su hash.
        $token = Str::random(64);

        DB::table('password_reset_tokens')->updateOrInsert(
            ['email' => $user->email],
            [
                'token' => Hash::make($token),
                'created_at' => Carbon::now(),
            ]
        );

        $frontendUrl = rtrim((string) env('APP_FRONTEND_URL', config('app.url')), '/');
        $resetUrl = $frontendUrl . '/restablecer?token=' . $token . '&email=' . urlencode($user->email);

        try {
            Mail::to($user->email)->send(
                new PasswordResetMail($user->name, $resetUrl, self::RESET_TOKEN_TTL_MINUTES)
            );
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => 'No pudimos enviar el correo en este momento. Intenta más tarde.',
            ], 500);
        }

        return response()->json(['message' => $genericMessage]);
    }

    /**
     * Paso 2 de la recuperación: valida el token recibido por correo y
     * establece la nueva contraseña. El token se invalida tras usarse o vencer.
     */
    public function resetPassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'token' => 'required|string',
            'password' => 'required|string|min:6|confirmed',
        ]);

        $email = mb_strtolower(trim($validated['email']));
        $user = User::whereRaw('LOWER(email) = ?', [$email])->first();

        $record = $user
            ? DB::table('password_reset_tokens')->where('email', $user->email)->first()
            : null;

        if (!$user || !$record || !Hash::check($validated['token'], $record->token)) {
            return response()->json([
                'message' => 'El enlace no es válido. Solicita uno nuevo.',
            ], 422);
        }

        // ¿Expiró el token?
        if (Carbon::parse($record->created_at)->addMinutes(self::RESET_TOKEN_TTL_MINUTES)->isPast()) {
            DB::table('password_reset_tokens')->where('email', $user->email)->delete();

            return response()->json([
                'message' => 'El enlace expiró. Solicita uno nuevo.',
            ], 422);
        }

        $user->password = $validated['password'];
        $user->save();

        // Un solo uso: se elimina el token y se cierran las sesiones activas.
        DB::table('password_reset_tokens')->where('email', $user->email)->delete();
        $user->tokens()->delete();

        return response()->json([
            'message' => 'Tu contraseña se actualizó. Ya puedes iniciar sesión.',
        ]);
    }

    /** Historial de accesos del propio usuario (para /mi-perfil y /mi-actividad). */
    public function myLogins(Request $request): JsonResponse
    {
        $limit = min(100, max(10, (int) $request->query('limit', 50)));

        $logs = LoginLog::where('user_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get(['id', 'status', 'browser', 'os', 'device_type', 'ip_address', 'created_at'])
            ->map(fn ($l) => [
                'id' => $l->id,
                'status' => $l->status,
                'browser' => $l->browser,
                'os' => $l->os,
                'device_type' => $l->device_type,
                'ip_address' => $l->ip_address,
                'at' => $l->created_at?->toIso8601String(),
            ]);

        return response()->json($logs);
    }

    private function extractClientInfo(Request $request): array
    {
        $ua = $request->userAgent() ?? '';

        // Detect browser
        $browser = 'Desconocido';
        if (preg_match('/Edg\//i', $ua)) $browser = 'Edge';
        elseif (preg_match('/OPR|Opera/i', $ua)) $browser = 'Opera';
        elseif (preg_match('/Chrome/i', $ua)) $browser = 'Chrome';
        elseif (preg_match('/Firefox/i', $ua)) $browser = 'Firefox';
        elseif (preg_match('/Safari/i', $ua)) $browser = 'Safari';
        elseif (preg_match('/MSIE|Trident/i', $ua)) $browser = 'Internet Explorer';

        // Detect OS
        $os = 'Desconocido';
        if (preg_match('/Windows NT 10/i', $ua)) $os = 'Windows 10/11';
        elseif (preg_match('/Windows/i', $ua)) $os = 'Windows';
        elseif (preg_match('/Mac OS X/i', $ua)) $os = 'macOS';
        elseif (preg_match('/Linux/i', $ua)) $os = 'Linux';
        elseif (preg_match('/Android/i', $ua)) $os = 'Android';
        elseif (preg_match('/iPhone|iPad/i', $ua)) $os = 'iOS';

        // Detect device type
        $deviceType = 'Desktop';
        if (preg_match('/Mobile|Android.*Mobile|iPhone/i', $ua)) $deviceType = 'Mobile';
        elseif (preg_match('/Tablet|iPad/i', $ua)) $deviceType = 'Tablet';

        return [
            'browser' => $browser,
            'os' => $os,
            'device_type' => $deviceType,
        ];
    }
}
