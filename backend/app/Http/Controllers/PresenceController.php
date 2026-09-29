<?php

namespace App\Http\Controllers;

use App\Models\PresenceDay;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PresenceController extends Controller
{
    /** Segundos máximos aceptados por heartbeat (tolera catch-up en 2º plano). */
    private const MAX_DELTA = 3600;

    /**
     * Acumula segundos de presencia/ausencia del día para el usuario autenticado.
     * Solo recibe conteos; nunca imágenes ni video. El monitoreo por cámara es
     * implícito al usar la suite (se avisa al ingresar); no requiere opt-in.
     */
    public function heartbeat(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'present_delta' => 'required|integer|min:0|max:' . self::MAX_DELTA,
            'absent_delta' => 'required|integer|min:0|max:' . self::MAX_DELTA,
        ]);

        $today = PresenceDay::today();

        $row = PresenceDay::firstOrNew([
            'user_id' => $user->id,
            'date' => $today,
        ]);

        $row->present_seconds = (int) $row->present_seconds + $validated['present_delta'];
        $row->absent_seconds = (int) $row->absent_seconds + $validated['absent_delta'];
        $row->samples = (int) $row->samples + 1;
        $row->first_seen_at ??= now();
        $row->last_seen_at = now();
        if ($validated['present_delta'] > 0) {
            $row->last_present_at = now();
        }
        $row->save();

        return response()->json([
            'date' => $today,
            'present_seconds' => $row->present_seconds,
            'absent_seconds' => $row->absent_seconds,
        ]);
    }

    /**
     * Presencia propia: hoy + últimos 7 días + estado de consentimiento.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        $today = PresenceDay::today();

        $todayRow = PresenceDay::where('user_id', $user->id)->where('date', $today)->first();

        $week = PresenceDay::where('user_id', $user->id)
            ->where('date', '>=', now(PresenceDay::TZ)->subDays(6)->toDateString())
            ->orderBy('date')
            ->get(['date', 'present_seconds', 'absent_seconds'])
            ->map(fn ($r) => [
                'date' => $r->date->toDateString(),
                'present_seconds' => $r->present_seconds,
                'absent_seconds' => $r->absent_seconds,
            ]);

        return response()->json([
            'consent' => (bool) $user->presence_consent_at,
            'consent_at' => $user->presence_consent_at?->toIso8601String(),
            'today' => [
                'present_seconds' => $todayRow->present_seconds ?? 0,
                'absent_seconds' => $todayRow->absent_seconds ?? 0,
            ],
            'week' => $week,
        ]);
    }

    /**
     * Otorga o revoca el consentimiento del monitoreo de presencia.
     */
    public function consent(Request $request): JsonResponse
    {
        $validated = $request->validate(['granted' => 'required|boolean']);
        $user = $request->user();

        $user->presence_consent_at = $validated['granted'] ? now() : null;
        $user->save();

        AuditLogger::record(
            $request,
            $validated['granted'] ? 'presence.consent_granted' : 'presence.consent_revoked',
            'user',
            $user->id,
            $validated['granted']
                ? "Activó el monitoreo de presencia"
                : "Desactivó el monitoreo de presencia"
        );

        return response()->json(['consent' => (bool) $user->presence_consent_at]);
    }
}
