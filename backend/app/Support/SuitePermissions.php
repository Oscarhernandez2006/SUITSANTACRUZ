<?php

namespace App\Support;

/**
 * Catálogo de permisos de los módulos propios de la Suite.
 * Clave de módulo = acceso (incluye ver); "modulo.accion" = acción granular.
 */
class SuitePermissions
{
    /** Módulos a los que todo usuario tiene acceso (no se pueden quitar). */
    public const DEFAULTS = ['dashboard', 'apps'];

    public const CATALOG = [
        [
            'group' => 'General',
            'modules' => [
                ['key' => 'dashboard', 'label' => 'Dashboard', 'icon' => 'dashboard', 'locked' => true,
                    'description' => 'Página de inicio con tus aplicaciones.',
                    'actions' => [['key' => 'stats', 'label' => 'Ver indicadores de administración']]],
            ],
        ],
        [
            'group' => 'Aplicaciones',
            'modules' => [
                ['key' => 'apps', 'label' => 'Explorar apps', 'icon' => 'grid_view', 'locked' => true,
                    'description' => 'Catálogo de aplicaciones asignadas al usuario.',
                    'actions' => [
                        ['key' => 'create', 'label' => 'Crear aplicaciones'],
                        ['key' => 'edit', 'label' => 'Editar aplicaciones'],
                        ['key' => 'delete', 'label' => 'Eliminar aplicaciones'],
                    ]],
            ],
        ],
        [
            'group' => 'Configuración',
            'modules' => [
                ['key' => 'users', 'label' => 'Usuarios', 'icon' => 'group',
                    'description' => 'Listado y fichas de usuarios de la Suite.',
                    'actions' => [
                        ['key' => 'create', 'label' => 'Crear usuarios'],
                        ['key' => 'edit', 'label' => 'Editar usuarios'],
                        ['key' => 'delete', 'label' => 'Eliminar usuarios'],
                        ['key' => 'face', 'label' => 'Gestionar reconocimiento facial'],
                    ]],
                ['key' => 'roles', 'label' => 'Grupos', 'icon' => 'groups',
                    'description' => 'Grupos de acceso y sus permisos.',
                    'actions' => [
                        ['key' => 'create', 'label' => 'Crear grupos'],
                        ['key' => 'edit', 'label' => 'Editar grupos'],
                        ['key' => 'delete', 'label' => 'Eliminar grupos'],
                    ]],
                ['key' => 'permissions', 'label' => 'Permisos', 'icon' => 'admin_panel_settings',
                    'description' => 'Accesos de cada usuario a las aplicaciones externas.',
                    'actions' => [
                        ['key' => 'edit', 'label' => 'Asignar y quitar accesos'],
                        ['key' => 'import', 'label' => 'Importar usuarios desde apps'],
                    ]],
                ['key' => 'announcements', 'label' => 'Anuncios', 'icon' => 'campaign',
                    'description' => 'Anuncios internos para todos los usuarios.',
                    'actions' => [
                        ['key' => 'create', 'label' => 'Publicar anuncios'],
                        ['key' => 'edit', 'label' => 'Editar anuncios'],
                        ['key' => 'delete', 'label' => 'Eliminar anuncios'],
                    ]],
            ],
        ],
        [
            'group' => 'Monitoreo',
            'modules' => [
                ['key' => 'stats', 'label' => 'Estadísticas generales', 'icon' => 'monitoring',
                    'description' => 'Indicadores del día de todas las aplicaciones.',
                    'actions' => []],
                ['key' => 'presence', 'label' => 'Presencia', 'icon' => 'timer',
                    'description' => 'Tiempo de trabajo y ranking mensual.',
                    'actions' => [
                        ['key' => 'export', 'label' => 'Exportar CSV'],
                        ['key' => 'revoke', 'label' => 'Revocar consentimiento de cámara'],
                    ]],
                ['key' => 'sessions', 'label' => 'Sesiones', 'icon' => 'devices',
                    'description' => 'Personas conectadas en tiempo real.',
                    'actions' => [['key' => 'revoke', 'label' => 'Revocar sesiones']]],
                ['key' => 'audit', 'label' => 'Auditoría', 'icon' => 'history',
                    'description' => 'Registro de acciones realizadas en la Suite.',
                    'actions' => [['key' => 'export', 'label' => 'Exportar CSV']]],
            ],
        ],
    ];

    /** Todas las claves válidas (módulos y acciones). */
    public static function all(): array
    {
        $keys = [];
        foreach (self::CATALOG as $group) {
            foreach ($group['modules'] as $module) {
                $keys[] = $module['key'];
                foreach ($module['actions'] as $action) {
                    $keys[] = $module['key'] . '.' . $action['key'];
                }
            }
        }

        return $keys;
    }

    /** Filtra claves inválidas; una acción sin su módulo se descarta. */
    public static function normalize(array $permissions): array
    {
        $valid = self::all();
        $set = array_values(array_unique(array_merge(
            self::DEFAULTS,
            array_intersect(array_map('strval', $permissions), $valid)
        )));

        return array_values(array_filter($set, function (string $key) use ($set) {
            $module = explode('.', $key)[0];

            return $module === $key || in_array($module, $set, true);
        }));
    }
}
