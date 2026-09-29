import { Component, EventEmitter, HostListener, OnInit, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ApplicationsService } from '../../services/applications.service';

interface PaletteItem {
  icon: string;
  label: string;
  sub: string;
  color?: string;
  action: () => void;
}

@Component({
  selector: 'sc-command-palette',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './command-palette.html',
  styleUrl: './command-palette.scss',
})
export class CommandPalette implements OnInit {
  @Output() close = new EventEmitter<void>();

  private router = inject(Router);
  private authService = inject(AuthService);
  private appService = inject(ApplicationsService);

  readonly query = signal('');
  readonly selectedIdx = signal(0);

  private baseItems: PaletteItem[] = [];

  readonly results = computed<PaletteItem[]>(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.baseItems.slice(0, 8);
    return this.baseItems.filter((i) =>
      i.label.toLowerCase().includes(q) || i.sub.toLowerCase().includes(q)
    ).slice(0, 10);
  });

  ngOnInit(): void {
    const nav = (path: string) => () => { this.router.navigate([path]); this.close.emit(); };

    this.baseItems = [
      { icon: 'home', label: 'Inicio', sub: 'Portal principal', action: nav('/portal') },
      { icon: 'grid_view', label: 'Aplicaciones', sub: 'Ver todas las apps', action: nav('/apps') },
      { icon: 'person', label: 'Mi perfil', sub: 'Ver y editar perfil', action: nav('/mi-perfil') },
      { icon: 'history', label: 'Mi actividad', sub: 'Historial de accesos', action: nav('/mi-actividad') },
    ];

    const can = (p: string) => this.authService.can(p);
    const adminItems: (PaletteItem & { perm: string })[] = [
      { perm: 'users', icon: 'group', label: 'Usuarios', sub: 'Gestión de usuarios', action: nav('/admin/usuarios') },
      { perm: 'roles', icon: 'groups', label: 'Grupos', sub: 'Grupos de acceso', action: nav('/admin/roles') },
      { perm: 'announcements', icon: 'campaign', label: 'Anuncios', sub: 'Comunicados internos', action: nav('/admin/anuncios') },
      { perm: 'stats', icon: 'monitoring', label: 'Estadísticas generales', sub: 'Indicadores de todas las apps', action: nav('/admin/estadisticas') },
      { perm: 'presence', icon: 'timer', label: 'Presencia', sub: 'Monitor de presencia', action: nav('/admin/presencia') },
      { perm: 'sessions', icon: 'devices', label: 'Sesiones', sub: 'Sesiones activas', action: nav('/admin/sesiones') },
      { perm: 'audit', icon: 'history', label: 'Auditoría', sub: 'Bitácora de cambios', action: nav('/admin/auditoria') },
    ];
    this.baseItems.push(...adminItems.filter((i) => can(i.perm)).map(({ perm: _perm, ...item }) => item));

    // Load apps dynamically
    this.appService.getApplications().subscribe({
      next: (apps) => {
        const appItems: PaletteItem[] = apps.map((app) => ({
          icon: app.icon || 'apps',
          label: app.name,
          sub: app.category || 'Aplicación',
          color: app.color || undefined,
          action: () => { window.open(app.url, '_blank'); this.close.emit(); },
        }));
        this.baseItems = [...this.baseItems, ...appItems];
      },
    });
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') { this.close.emit(); return; }
    const len = this.results().length;
    if (e.key === 'ArrowDown') { e.preventDefault(); this.selectedIdx.update((i) => Math.min(i + 1, len - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); this.selectedIdx.update((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); this.run(this.results()[this.selectedIdx()]); }
  }

  run(item: PaletteItem | undefined): void {
    if (!item) return;
    item.action();
  }

  onQueryChange(v: string): void { this.query.set(v); this.selectedIdx.set(0); }
}
