<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\PresenceDay;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PresenceController extends Controller
{
    /** Meta de horas de presencia por día laboral. */
    private const TARGET_DAILY_HOURS = 8;

    private function authorizeAdmin(Request $request, string ...$permissions): void
    {
        $this->authorizeSuite($request, ...$permissions);
    }

    /**
     * Presencia por usuario y día, con filtros de fecha/usuario.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request, 'presence', 'sessions', 'stats');

        $from = $request->query('from', now()->toDateString());
        $to = $request->query('to', now()->toDateString());

        $query = PresenceDay::query()
            ->with('user:id,name,cedula')
            ->whereDate('date', '>=', $from)
            ->whereDate('date', '<=', $to)
            ->orderByDesc('date')
            ->orderByDesc('present_seconds');

        if ($userId = $request->query('user_id')) {
            $query->where('user_id', (int) $userId);
        }

        $rows = $query->get()->map(fn (PresenceDay $r) => [
            'id' => $r->id,
            'user_id' => $r->user_id,
            'user' => $r->user->name ?? '—',
            'cedula' => $r->user->cedula ?? null,
            'date' => $r->date->toDateString(),
            'present_seconds' => $r->present_seconds,
            'absent_seconds' => $r->absent_seconds,
            'first_seen_at' => $r->first_seen_at?->toIso8601String(),
            'last_seen_at' => $r->last_seen_at?->toIso8601String(),
        ]);

        // Totales por usuario en el rango (para el resumen).
        $byUser = $rows->groupBy('user_id')->map(fn ($group) => [
            'user_id' => $group->first()['user_id'],
            'user' => $group->first()['user'],
            'present_seconds' => $group->sum('present_seconds'),
            'absent_seconds' => $group->sum('absent_seconds'),
            'days' => $group->count(),
        ])->sortByDesc('present_seconds')->values();

        return response()->json([
            'from' => $from,
            'to' => $to,
            'rows' => $rows,
            'by_user' => $byUser,
        ]);
    }

    /**
     * Exporta la presencia del rango como CSV.
     */
    public function export(Request $request): StreamedResponse
    {
        $this->authorizeAdmin($request, 'presence.export');

        $from = $request->query('from', now()->toDateString());
        $to = $request->query('to', now()->toDateString());

        $query = PresenceDay::query()
            ->with('user:id,name,cedula')
            ->whereDate('date', '>=', $from)
            ->whereDate('date', '<=', $to)
            ->orderBy('date');

        $filename = "presencia-{$from}_a_{$to}.csv";

        return response()->streamDownload(function () use ($query) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, ['Fecha', 'Usuario', 'Cedula', 'Presente (h)', 'Ausente (h)', 'Presente (s)', 'Ausente (s)']);
            $query->chunk(500, function ($rows) use ($out) {
                foreach ($rows as $r) {
                    fputcsv($out, [
                        $r->date->toDateString(),
                        $r->user->name ?? '',
                        $r->user->cedula ?? '',
                        round($r->present_seconds / 3600, 2),
                        round($r->absent_seconds / 3600, 2),
                        $r->present_seconds,
                        $r->absent_seconds,
                    ]);
                }
            });
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * Resumen mensual por usuario: horas de presencia vs meta (8h/día),
     * % de cumplimiento, consistencia/estabilidad y ranking.
     */
    public function monthly(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request, 'presence');

        $month = $request->query('month', now()->format('Y-m'));
        try {
            $start = Carbon::parse($month . '-01')->startOfMonth();
        } catch (\Throwable $e) {
            $start = now()->startOfMonth();
        }

        [$users, $summary] = $this->monthStats($start);
        [, $previous] = $this->monthStats($start->copy()->subMonthNoOverflow());

        return response()->json([
            'month' => $start->format('Y-m'),
            'target_daily_hours' => self::TARGET_DAILY_HOURS,
            'summary' => $summary,
            'previous_summary' => $previous,
            'ranking' => $users,
        ]);
    }

    /**
     * Revoca el consentimiento de cámara: el usuario deberá aceptarlo de nuevo
     * para volver a ser monitoreado.
     */
    public function revokeConsent(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdmin($request, 'presence.revoke');

        $user->presence_consent_at = null;
        $user->save();

        AuditLogger::record($request, 'presence.consent_revoked', 'user', $user->id, "Consentimiento de cámara revocado: {$user->name}");

        return response()->json(['message' => 'Consentimiento revocado']);
    }

    /** Ranking y resumen de un mes. */
    private function monthStats(Carbon $start): array
    {
        $end = $start->copy()->endOfMonth();

        $rows = PresenceDay::query()
            ->with('user:id,name,cedula,role_id,presence_consent_at', 'user.role:id,name,color')
            ->whereBetween('date', [$start->toDateString(), $end->toDateString()])
            ->get();

        $target = self::TARGET_DAILY_HOURS;

        $users = $rows->groupBy('user_id')->map(function ($group) use ($target) {
            $daily = $group->map(fn ($r) => round($r->present_seconds / 3600, 2))->values();
            $days = $daily->count();
            $presentHours = round($daily->sum(), 2);
            $avg = $days > 0 ? round($presentHours / $days, 2) : 0.0;

            // Cumplimiento: promedio del % diario (tope 100% por día).
            $complianceDaily = $daily->map(fn ($h) => min(100, $target > 0 ? ($h / $target) * 100 : 0));
            $compliance = $days > 0 ? round($complianceDaily->avg(), 1) : 0.0;

            // Consistencia: 100 menos el coeficiente de variación (menos dispersión = más estable).
            $consistency = 0.0;
            if ($days > 1 && $avg > 0) {
                $mean = $daily->avg();
                $variance = $daily->reduce(fn ($carry, $h) => $carry + (($h - $mean) ** 2), 0.0) / $days;
                $std = sqrt($variance);
                $cv = $mean > 0 ? $std / $mean : 1;
                $consistency = round(max(0, (1 - min(1, $cv))) * 100, 1);
            } elseif ($days === 1) {
                $consistency = 100.0;
            }

            // Puntaje combinado (60% cumplimiento, 40% consistencia).
            $score = round($compliance * 0.6 + $consistency * 0.4, 1);

            $first = $group->first();

            return [
                'user_id' => $first->user_id,
                'user' => $first->user->name ?? '—',
                'cedula' => $first->user->cedula ?? null,
                'role_name' => $first->user->role->name ?? null,
                'role_color' => $first->user->role->color ?? null,
                'has_consent' => (bool) $first->user?->presence_consent_at,
                'days' => $days,
                'present_hours' => $presentHours,
                'target_hours' => round($target * $days, 1),
                'avg_daily_hours' => $avg,
                'compliance_pct' => $compliance,
                'consistency_pct' => $consistency,
                'score' => $score,
            ];
        })->sortByDesc('score')->values();

        $summary = [
            'users' => $users->count(),
            'total_hours' => round($users->sum('present_hours'), 1),
            'total_days' => (int) $users->sum('days'),
            'avg_daily_hours' => $users->count() ? round($users->avg('avg_daily_hours'), 2) : 0.0,
            'avg_compliance' => $users->count() ? round($users->avg('compliance_pct'), 1) : 0.0,
            'avg_consistency' => $users->count() ? round($users->avg('consistency_pct'), 1) : 0.0,
            'top_user' => $users->first()['user'] ?? null,
            'top_score' => $users->first()['score'] ?? null,
        ];

        return [$users, $summary];
    }
}
