<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AnnouncementController extends Controller
{
    private function authorizeAdmin(Request $request, string ...$permissions): void
    {
        $this->authorizeSuite($request, ...$permissions);
    }

    // ---- Endpoint público (solo autenticado) ----

    /** Devuelve anuncios activos no vistos por el usuario actual. */
    public function active(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $seen = \DB::table('announcement_views')
            ->where('user_id', $userId)
            ->pluck('announcement_id')
            ->all();

        $items = Announcement::active()
            ->whereNotIn('id', $seen)
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (Announcement $a) => [
                'id' => $a->id,
                'title' => $a->title,
                'body' => $a->body,
                'expires_at' => $a->expires_at?->toIso8601String(),
                'created_at' => $a->created_at?->toIso8601String(),
            ]);

        return response()->json($items);
    }

    /** Registra que el usuario vio un anuncio. */
    public function markViewed(Request $request, Announcement $announcement): JsonResponse
    {
        \DB::table('announcement_views')->updateOrInsert(
            ['announcement_id' => $announcement->id, 'user_id' => $request->user()->id],
            ['viewed_at' => now()],
        );

        return response()->json(['ok' => true]);
    }

    // ---- CRUD admin ----

    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request, 'announcements');

        $items = Announcement::with('publisher:id,name')
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (Announcement $a) => [
                'id' => $a->id,
                'title' => $a->title,
                'body' => $a->body,
                'published_by' => $a->publisher?->name,
                'expires_at' => $a->expires_at?->toIso8601String(),
                'created_at' => $a->created_at?->toIso8601String(),
            ]);

        return response()->json($items);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request, 'announcements.create');

        $validated = $request->validate([
            'title' => 'required|string|max:200',
            'body' => 'required|string|max:2000',
            'expires_at' => 'nullable|date|after:now',
        ]);

        $ann = Announcement::create([
            ...$validated,
            'published_by' => $request->user()->id,
        ]);

        // Notificación broadcast para todos los usuarios
        Notification::dispatch(
            'announcement',
            $ann->title,
            mb_substr($ann->body, 0, 100) . (mb_strlen($ann->body) > 100 ? '…' : ''),
            null,
            ['announcement_id' => $ann->id],
        );

        return response()->json(['id' => $ann->id], 201);
    }

    public function update(Request $request, Announcement $announcement): JsonResponse
    {
        $this->authorizeAdmin($request, 'announcements.edit');

        $validated = $request->validate([
            'title' => 'required|string|max:200',
            'body' => 'required|string|max:2000',
            'expires_at' => 'nullable|date',
        ]);

        $announcement->update($validated);

        return response()->json(['ok' => true]);
    }

    public function destroy(Request $request, Announcement $announcement): JsonResponse
    {
        $this->authorizeAdmin($request, 'announcements.delete');
        $announcement->delete();

        return response()->json(['ok' => true]);
    }
}
