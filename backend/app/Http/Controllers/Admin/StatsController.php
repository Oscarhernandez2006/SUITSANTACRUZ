<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Application;
use App\Models\LoginLog;
use App\Models\SsoTicket;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class StatsController extends Controller
{
    private function authorizeAdmin(Request $request): void
    {
        $this->authorizeSuite($request, 'dashboard.stats', 'stats');
    }

    /**
     * Dashboard de estadísticas de la suite (solo administradores).
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $days = max(1, min(90, (int) $request->query('days', 7)));

        $now = Carbon::now();
        $since7 = $now->copy()->subDays($days);
        $since30 = $now->copy()->subDays(30);

        // ---- Resumen general ----
        $totalUsers = User::count();
        $activeUsers = User::where('is_active', true)->count();
        $adminUsers = User::where('is_admin', true)->count();

        $totalApps = Application::count();
        $activeApps = Application::where('is_active', true)->count();

        $totalAccessGrants = DB::table('application_user')->count();

        $ssoLast7 = SsoTicket::where('created_at', '>=', $since7)->count();
        $loginsLast7 = LoginLog::where('created_at', '>=', $since7)->count();
        $loginsOkLast7 = LoginLog::where('created_at', '>=', $since7)
            ->where('status', 'success')->count();

        // ---- Aplicaciones por categoría ----
        $appsByCategory = Application::query()
            ->where('is_active', true)
            ->selectRaw("COALESCE(NULLIF(category, ''), 'Sin categoría') as category, count(*) as count")
            ->groupBy('category')
            ->orderByDesc('count')
            ->get()
            ->map(fn ($row) => [
                'category' => $row->category,
                'count' => (int) $row->count,
            ]);

        // ---- Accesos por aplicación (cuántos usuarios tienen cada app) ----
        $accessPerApp = Application::query()
            ->withCount('users')
            ->orderByDesc('users_count')
            ->orderBy('name')
            ->get()
            ->map(fn ($app) => [
                'id' => $app->id,
                'name' => $app->name,
                'slug' => $app->slug,
                'icon' => $app->icon,
                'color' => $app->color,
                'is_active' => (bool) $app->is_active,
                'users_count' => (int) $app->users_count,
            ]);

        // ---- Actividad SSO por aplicación (últimos 30 días) ----
        $ssoCounts = SsoTicket::query()
            ->where('created_at', '>=', $since30)
            ->selectRaw('application_id, count(*) as count')
            ->groupBy('application_id')
            ->pluck('count', 'application_id');

        $appNames = Application::pluck('name', 'id');
        $ssoByApp = collect($ssoCounts)
            ->map(fn ($count, $appId) => [
                'application' => $appNames[$appId] ?? 'Desconocida',
                'count' => (int) $count,
            ])
            ->sortByDesc('count')
            ->values();

        // ---- Últimos ingresos (login_logs) ----
        $recentLogins = LoginLog::query()
            ->with('user:id,name')
            ->latest()
            ->limit(8)
            ->get()
            ->map(fn ($log) => [
                'user' => $log->user->name ?? $log->cedula,
                'status' => $log->status,
                'browser' => $log->browser,
                'os' => $log->os,
                'device_type' => $log->device_type,
                'ip_address' => $log->ip_address,
                'at' => $log->created_at?->toIso8601String(),
            ]);

        // ---- Tendencia de ingresos (últimos 7 días) ----
        $trendRaw = LoginLog::query()
            ->where('created_at', '>=', $since7->copy()->startOfDay())
            ->selectRaw("to_char(created_at, 'YYYY-MM-DD') as day, count(*) as count")
            ->groupBy('day')
            ->pluck('count', 'day');

        $loginsTrend = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $day = $now->copy()->subDays($i)->format('Y-m-d');
            $loginsTrend[] = [
                'day' => $day,
                'count' => (int) ($trendRaw[$day] ?? 0),
            ];
        }

        return response()->json([
            'range_days' => $days,
            'summary' => [
                'users_total' => $totalUsers,
                'users_active' => $activeUsers,
                'users_inactive' => $totalUsers - $activeUsers,
                'users_admins' => $adminUsers,
                'apps_total' => $totalApps,
                'apps_active' => $activeApps,
                'access_grants' => $totalAccessGrants,
                'sso_last_7d' => $ssoLast7,
                'logins_last_7d' => $loginsLast7,
                'logins_ok_last_7d' => $loginsOkLast7,
            ],
            'apps_by_category' => $appsByCategory,
            'access_per_app' => $accessPerApp,
            'sso_by_app' => $ssoByApp,
            'recent_logins' => $recentLogins,
            'logins_trend' => $loginsTrend,
        ]);
    }

    /**
     * Export login activity for a date range as CSV.
     */
    public function export(Request $request): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $this->authorizeAdmin($request);

        $from = $request->query('from');
        $to = $request->query('to');

        $query = LoginLog::query()->with('user:id,name')->latest();
        if ($from) {
            $query->whereDate('created_at', '>=', $from);
        }
        if ($to) {
            $query->whereDate('created_at', '<=', $to);
        }

        $filename = 'actividad-ingresos-' . now()->format('Ymd-His') . '.csv';

        return response()->streamDownload(function () use ($query) {
            $out = fopen('php://output', 'w');
            // BOM para que Excel respete UTF-8.
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, ['Fecha', 'Usuario', 'Cedula', 'Estado', 'Navegador', 'SO', 'Dispositivo', 'IP']);
            $query->chunk(500, function ($rows) use ($out) {
                foreach ($rows as $log) {
                    fputcsv($out, [
                        $log->created_at?->toDateTimeString(),
                        $log->user->name ?? '',
                        $log->cedula,
                        $log->status,
                        $log->browser,
                        $log->os,
                        $log->device_type,
                        $log->ip_address,
                    ]);
                }
            });
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }
}
