<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Application;
use App\Support\ProvisioningClient;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\Response;

/**
 * Proxy de métricas ejecutivas de las apps externas.
 * Solo para admins de la suite; reenvía el secreto SSO para autenticar
 * la petición en cada app.
 */
class CrossDashboardController extends Controller
{
    private const KNOWN_APPS = ['sigcom', 'sigcompro', 'sigtraz', 'creditos', 'sigcan', 'sigroute', 'signom', 'liquidacion-drivin-web'];

    public function __construct(private readonly ProvisioningClient $client) {}

    private function authorizeAdmin(Request $request): void
    {
        abort_unless((bool) $request->user()->is_admin, Response::HTTP_FORBIDDEN, 'No autorizado');
    }

    private function resumenUrl(Application $app): ?string
    {
        $base = $this->client->baseUrl($app);
        return $base ? $base . '/api/resumen-ejecutivo' : null;
    }

    private function fetchResumen(string $slug): array|null
    {
        $app = Application::where('slug', $slug)->where('is_active', true)->first();
        if (!$app || !($url = $this->resumenUrl($app))) return null;

        try {
            $res = Http::withHeaders(['X-SSO-Secret' => (string) config('services.sso.shared_secret')])
                ->acceptJson()
                ->timeout(6)
                ->get($url);

            if ($res->successful() && is_array($res->json())) {
                return $res->json();
            }
        } catch (\Throwable) {}

        return null;
    }

    /**
     * Resumen de todas las apps con API de aprovisionamiento, en paralelo.
     * Cada app responde { metrics: [{ key, label, value, format?, tone? }] }.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        // Se une con la lista conocida por si el config cache del servidor quedó viejo.
        $slugs = array_unique(array_merge(self::KNOWN_APPS, (array) config('services.provisioning.apps', [])));
        $apps = Application::whereIn('slug', $slugs)->where('is_active', true)
            ->orderBy('sort_order')->orderBy('name')->get();

        $targets = [];
        foreach ($apps as $app) {
            if ($url = $this->resumenUrl($app)) $targets[$app->slug] = $url;
        }

        $secret = (string) config('services.sso.shared_secret');
        $responses = $targets ? Http::pool(function (Pool $pool) use ($targets, $secret) {
            foreach ($targets as $slug => $url) {
                $pool->as($slug)->withHeaders(['X-SSO-Secret' => $secret])->acceptJson()->timeout(6)->get($url);
            }
        }) : [];

        $out = $apps->map(function (Application $app) use ($responses) {
            $res = $responses[$app->slug] ?? null;
            $metrics = [];
            $status = 'unavailable';
            if ($res instanceof \Illuminate\Http\Client\Response) {
                $json = $res->successful() ? $res->json() : null;
                if (is_array($json) && isset($json['metrics']) && is_array($json['metrics'])) {
                    $metrics = array_values(array_filter($json['metrics'], fn ($m) => is_array($m) && isset($m['label'])));
                    $status = 'ok';
                } else {
                    $status = 'error';
                }
            }
            return [
                'slug' => $app->slug,
                'name' => $app->name,
                'icon' => $app->icon,
                'color' => $app->color,
                'logo' => $app->logo,
                'url' => $app->url,
                'status' => $status,
                'metrics' => $metrics,
            ];
        })->values();

        return response()->json(['generated_at' => now()->toIso8601String(), 'apps' => $out]);
    }

    public function sigcom(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $data = $this->fetchResumen('sigcom');
        if (!$data) return response()->json(null, 204);
        return response()->json($data);
    }

    public function sigcompro(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $data = $this->fetchResumen('sigcompro');
        if (!$data) return response()->json(null, 204);
        return response()->json($data);
    }
}
