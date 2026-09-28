<?php

namespace Database\Seeders;

use App\Models\Application;
use App\Models\User;
use Illuminate\Database\Seeder;

class ApplicationSeeder extends Seeder
{
    /**
     * Seed the applications catalog and grant access to existing users.
     */
    public function run(): void
    {
        $applications = [
            [
                'slug' => 'siesa',
                'name' => 'Siesa Cloud',
                'description' => 'ERP en la nube: contabilidad, inventario y facturación con inicio de sesión automático',
                'icon' => 'cloud_sync',
                'url' => env('SIESA_URL', 'https://carnesantacruzapp.siesacloud.com/'),
                'category' => 'ERP',
                'color' => '#57AD31',
                'logo' => '/logo-siesa.png',
                'keywords' => 'siesa erp cloud contabilidad inventario facturacion',
                'type' => 'app',
                'sso_enabled' => false,
                'is_active' => true,
                'sort_order' => 1,
            ],
            [
                'slug' => 'incapacidades',
                'name' => 'Incapacidades',
                'description' => 'Registro y gestión de incapacidades médicas del personal del grupo empresarial',
                'icon' => 'medical_information',
                'url' => 'https://formularioincapacidades.grupo-santacruz.com/',
                'category' => 'RRHH',
                'color' => '#4A7FB5',
                'logo' => null,
                'keywords' => 'formulario incapacidad medica empleados',
                'type' => 'form',
                'sso_enabled' => false,
                'is_active' => true,
                'sort_order' => 2,
            ],
            [
                'slug' => 'sigcom',
                'name' => 'SIGCOM',
                'description' => 'Toma de pedidos comercial con integración a Siesa',
                'icon' => 'shopping_cart',
                'url' => env('SIGCOM_URL', 'http://localhost:5173'),
                'category' => 'Comercial',
                'color' => '#B5484A',
                'logo' => '/logo-sigcom.png',
                'keywords' => 'pedidos comercial ventas siesa clientes',
                'type' => 'app',
                'sso_enabled' => true,
                'is_active' => true,
                'sort_order' => 3,
            ],
            [
                'slug' => 'sigcompro',
                'name' => 'SIGCOMPRO',
                'description' => 'Gestión de pedidos, despacho, clientes y cuadre de caja',
                'icon' => 'inventory',
                'url' => env('SIGCOMPRO_URL', 'http://localhost:3000'),
                'category' => 'Operaciones',
                'color' => '#57AD31',
                'logo' => '/logo-sigcompro.png',
                'keywords' => 'pedidos despacho clientes cuadre caja cotizaciones',
                'type' => 'app',
                'sso_enabled' => true,
                'is_active' => true,
                'sort_order' => 4,
            ],
            [
                'slug' => 'ejecutables',
                'name' => 'Ejecutables',
                'description' => 'Procesador de integraciones Siesa: carga y procesa archivos Excel (pedidos, requisiciones, sobrecostos)',
                'icon' => 'factory',
                'url' => env('EJECUTABLES_URL', 'http://localhost:5000'),
                'category' => 'Integraciones',
                'color' => '#8B5A8F',
                'logo' => '/logo-ejecutables.svg',
                'keywords' => 'siesa integraciones pedidos requisiciones sobrecostos excel',
                'type' => 'app',
                'sso_enabled' => false,
                'is_active' => true,
                'sort_order' => 5,
            ],
            [
                'slug' => 'sigcan',
                'name' => 'Canastillas',
                'description' => 'Gestión de inventario y alquiler de canastillas (Canastilla Web)',
                'icon' => 'shopping_basket',
                'url' => env('SIGCAN_URL', 'http://localhost:5173'),
                'category' => 'Inventario',
                'color' => '#57AD31',
                'logo' => null,
                'keywords' => 'canastilla inventario alquiler remisiones lavado',
                'type' => 'app',
                'sso_enabled' => true,
                'is_active' => true,
                'sort_order' => 6,
            ],
            [
                'slug' => 'creditos',
                'name' => 'Créditos',
                'description' => 'Solicitudes de crédito, vinculación de clientes y registro de proveedores',
                'icon' => 'credit_score',
                'url' => env('CREDITOS_URL', 'http://localhost:5174'),
                'category' => 'Finanzas',
                'color' => '#2F6DB5',
                'logo' => null,
                'keywords' => 'creditos solicitudes clientes proveedores vinculacion cartera',
                'type' => 'app',
                'sso_enabled' => true,
                'is_active' => true,
                'sort_order' => 7,
            ],
            [
                'slug' => 'sigtraz',
                'name' => 'SIGTRAZ',
                'description' => 'Trazabilidad de productos y lotes, calidad y gestión agropecuaria',
                'icon' => 'qr_code',
                'url' => env('SIGTRAZ_URL', 'http://localhost:5173'),
                'category' => 'Calidad',
                'color' => '#3E7C59',
                'logo' => null,
                'keywords' => 'trazabilidad lotes calidad agropecuaria inspecciones productos',
                'type' => 'app',
                'sso_enabled' => true,
                'is_active' => true,
                'sort_order' => 8,
            ],
            [
                'slug' => 'sigroute',
                'name' => 'SIGROUTE',
                'description' => 'Planeación de rutas, despacho y seguimiento logístico',
                'icon' => 'route',
                'url' => env('SIGROUTE_URL', 'http://localhost:3000'),
                'category' => 'Logística',
                'color' => '#2F8F4E',
                'logo' => null,
                'keywords' => 'rutas despacho logistica ordenes drivin',
                'type' => 'app',
                'sso_enabled' => true,
                'is_active' => true,
                'sort_order' => 9,
            ],
            [
                'slug' => 'signom',
                'name' => 'SIGNOM',
                'description' => 'Gestión de novedades, asistencia y procesos de nómina',
                'icon' => 'badge',
                'url' => env('SIGNOM_URL', 'http://localhost:8090'),
                'category' => 'RRHH',
                'color' => '#2F6DB5',
                'logo' => null,
                'keywords' => 'nomina asistencia novedades rrhh biometrico',
                'type' => 'app',
                'sso_enabled' => true,
                'is_active' => true,
                'sort_order' => 10,
            ],
            [
                'slug' => 'liquidacion-drivin-web',
                'name' => 'Liquidación Drivin',
                'description' => 'Consulta y gestión de liquidaciones para domiciliarios',
                'icon' => 'payments',
                'url' => env('LIQUIDACION_DRIVIN_URL', 'http://localhost:3000'),
                'category' => 'Operaciones',
                'color' => '#4A7FB5',
                'logo' => null,
                'keywords' => 'liquidacion drivin domiciliarios incentivos pagos',
                'type' => 'app',
                'sso_enabled' => true,
                'is_active' => true,
                'sort_order' => 11,
            ],
        ];

        foreach ($applications as $data) {
            Application::updateOrCreate(['slug' => $data['slug']], $data);
        }

        // Otorgar acceso a todas las apps a los usuarios existentes (estado inicial).
        // Más adelante esto se gestiona individualmente desde la administración de permisos.
        $allApplicationIds = Application::pluck('id');
        User::all()->each(function (User $user) use ($allApplicationIds) {
            $user->applications()->syncWithoutDetaching($allApplicationIds);
        });
    }
}
