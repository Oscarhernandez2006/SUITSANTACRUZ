<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Application;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

class ApplicationController extends Controller
{
    /**
     * Ensure the authenticated user is an administrator.
     */
    private function authorizeAdmin(Request $request, string ...$permissions): void
    {
        $this->authorizeSuite($request, ...$permissions);
    }

    /**
     * List the full applications catalog (including inactive).
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request, 'apps.create', 'apps.edit', 'apps.delete');

        $applications = Application::query()
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json($applications);
    }

    /**
     * Create a new application.
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request, 'apps.create');

        $data = $this->validateData($request);
        $application = Application::create($data);

        AuditLogger::record($request, 'app.created', 'application', $application->id, "App creada: {$application->name}");

        return response()->json($application, Response::HTTP_CREATED);
    }

    /**
     * Update an existing application.
     */
    public function update(Request $request, Application $application): JsonResponse
    {
        $this->authorizeAdmin($request, 'apps.edit');

        $data = $this->validateData($request, $application->id);
        $application->update($data);

        AuditLogger::record($request, 'app.updated', 'application', $application->id, "App actualizada: {$application->name}");

        return response()->json($application);
    }

    /**
     * Delete an application.
     */
    public function destroy(Request $request, Application $application): JsonResponse
    {
        $this->authorizeAdmin($request, 'apps.delete');

        $application->delete();

        AuditLogger::record($request, 'app.deleted', 'application', $application->id, "App eliminada: {$application->name}");

        return response()->json(['message' => 'Aplicación eliminada']);
    }

    /**
     * Validate the incoming application payload.
     */
    private function validateData(Request $request, ?int $ignoreId = null): array
    {
        return $request->validate([
            'name' => 'required|string|max:255',
            'slug' => [
                'required',
                'string',
                'max:255',
                'regex:/^[a-z0-9-]+$/',
                Rule::unique('applications', 'slug')->ignore($ignoreId),
            ],
            'description' => 'nullable|string|max:1000',
            'icon' => 'nullable|string|max:100',
            'url' => 'required|url|max:2048',
            'category' => 'nullable|string|max:100',
            'color' => 'nullable|string|max:30',
            'logo' => 'nullable|string|max:3000000',
            'keywords' => 'nullable|string|max:500',
            'type' => 'required|in:app,form',
            'sso_enabled' => 'boolean',
            'is_active' => 'boolean',
            'sort_order' => 'nullable|integer|min:0',
        ], [
            'slug.regex' => 'El identificador (slug) solo puede contener minúsculas, números y guiones.',
            'url.url' => 'El enlace debe ser una URL válida (incluye https://).',
        ]);
    }
}
