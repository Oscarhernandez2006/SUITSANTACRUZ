import { Routes } from '@angular/router';
import { authGuard, guestGuard, permissionGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', loadComponent: () => import('./login/login').then(m => m.Login), canActivate: [guestGuard] },
  { path: 'restablecer', loadComponent: () => import('./reset-password/reset-password').then(m => m.ResetPassword), canActivate: [guestGuard] },
  {
    // Layout con nav persistente: se monta una sola vez y no se recrea al navegar.
    path: '',
    loadComponent: () => import('./shared/shell/shell').then(m => m.Shell),
    children: [
      { path: 'portal', loadComponent: () => import('./portal/portal').then(m => m.Portal), canActivate: [authGuard] },
      { path: 'apps', loadComponent: () => import('./apps/apps').then(m => m.AppsPage), canActivate: [authGuard] },
      { path: 'mi-perfil', loadComponent: () => import('./profile/profile').then(m => m.ProfilePage), canActivate: [authGuard] },
      { path: 'mi-actividad', loadComponent: () => import('./activity/activity').then(m => m.ActivityPage), canActivate: [authGuard] },
      { path: 'siesa-launch', loadComponent: () => import('./siesa-launch/siesa-launch').then(m => m.SiesaLaunch), canActivate: [authGuard] },
      { path: 'admin/panel', loadComponent: () => import('./admin/dashboard/dashboard').then(m => m.Dashboard), canActivate: [permissionGuard], data: { perm: 'dashboard.stats' } },
      { path: 'admin/permisos', redirectTo: 'admin/usuarios' },
      { path: 'admin/usuarios', loadComponent: () => import('./admin/users/users').then(m => m.UsersAdmin), canActivate: [permissionGuard], data: { perm: 'users' } },
      { path: 'admin/roles', loadComponent: () => import('./admin/groups/groups').then(m => m.Groups), canActivate: [permissionGuard], data: { perm: 'roles' } },
      { path: 'admin/anuncios', loadComponent: () => import('./admin/announcements/announcements').then(m => m.AnnouncementsAdmin), canActivate: [permissionGuard], data: { perm: 'announcements' } },
      { path: 'admin/auditoria', loadComponent: () => import('./admin/audit/audit').then(m => m.Audit), canActivate: [permissionGuard], data: { perm: 'audit' } },
      { path: 'admin/sesiones', loadComponent: () => import('./admin/sessions/sessions').then(m => m.Sessions), canActivate: [permissionGuard], data: { perm: 'sessions' } },
      { path: 'admin/presencia', loadComponent: () => import('./admin/presence/presence').then(m => m.PresenceAdmin), canActivate: [permissionGuard], data: { perm: 'presence' } },
      { path: 'admin/estadisticas', loadComponent: () => import('./admin/general-stats/general-stats').then(m => m.GeneralStats), canActivate: [permissionGuard], data: { perm: 'stats' } },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
