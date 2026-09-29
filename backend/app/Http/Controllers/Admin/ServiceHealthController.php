<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Application;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\Response;

class ServiceHealthController extends Controller
{
    private function authorizeAdmin(Request $request): void
    {
        $this->authorizeSuite($request, 'dashboard.stats', 'stats');
    }

    /**
     * Ping each active application URL and report availability.
     * Only checks reachability (HTTP status); does not read business data.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $apps = Application::query()
            ->where('is_active', true)
            ->whereNotNull('url')
            ->orderBy('sort_order')
            ->get(['id', 'name', 'slug', 'url', 'color', 'icon', 'logo']);

        $results = $apps->map(function (Application $app) {
            $start = microtime(true);
            $status = 'down';
            $httpCode = null;

            try {
                $response = Http::timeout(4)->connectTimeout(3)
                    ->withoutVerifying()
                    ->get($app->url);
                $httpCode = $response->status();
                $status = $httpCode < 500 ? 'up' : 'degraded';
            } catch (\Throwable $e) {
                $status = 'down';
            }

            return [
                'id' => $app->id,
                'name' => $app->name,
                'slug' => $app->slug,
                'url' => $app->url,
                'color' => $app->color,
                'icon' => $app->icon,
                'logo' => $app->logo,
                'status' => $status,
                'http_code' => $httpCode,
                'latency_ms' => (int) round((microtime(true) - $start) * 1000),
            ];
        });

        return response()->json([
            'checked_at' => now()->toIso8601String(),
            'services' => $results->values(),
        ]);
    }
}
