import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

interface NavLink {
  icon: string;
  label: string;
  route: string;
  perm?: string;
}

interface NavGroup {
  label?: string;
  items: NavLink[];
}

/** Barra lateral de navegación reutilizable (misma del dashboard) para las páginas internas. */
@Component({
  selector: 'app-sidebar',
  imports: [],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly groups = computed<NavGroup[]>(() => {
    this.auth.currentUser();
    const groups: NavGroup[] = [
      { items: [{ icon: 'dashboard', label: 'Dashboard', route: '/portal' }] },
      { label: 'Aplicaciones', items: [{ icon: 'grid_view', label: 'Explorar apps', route: '/apps' }] },
      {
        label: 'Configuración',
        items: [
          { icon: 'group', label: 'Usuarios', route: '/admin/usuarios', perm: 'users' },
          { icon: 'groups', label: 'Grupos', route: '/admin/roles', perm: 'roles' },
          { icon: 'admin_panel_settings', label: 'Permisos', route: '/admin/permisos', perm: 'permissions' },
          { icon: 'campaign', label: 'Anuncios', route: '/admin/anuncios', perm: 'announcements' },
        ],
      },
      {
        label: 'Monitoreo',
        items: [
          { icon: 'monitoring', label: 'Estadísticas generales', route: '/admin/estadisticas', perm: 'stats' },
          { icon: 'timer', label: 'Presencia', route: '/admin/presencia', perm: 'presence' },
          { icon: 'devices', label: 'Sesiones', route: '/admin/sesiones', perm: 'sessions' },
          { icon: 'history', label: 'Auditoría', route: '/admin/auditoria', perm: 'audit' },
        ],
      },
    ];
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || this.auth.can(i.perm)) }))
      .filter((g) => g.items.length > 0);
  });

  isActive(route: string): boolean {
    return this.router.url.startsWith(route);
  }

  go(route: string): void {
    this.router.navigate([route]);
  }
}
