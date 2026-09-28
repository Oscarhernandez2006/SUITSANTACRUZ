import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface SuiteStats {
  range_days: number;
  summary: {
    users_total: number;
    users_active: number;
    users_inactive: number;
    users_admins: number;
    apps_total: number;
    apps_active: number;
    access_grants: number;
    sso_last_7d: number;
    logins_last_7d: number;
    logins_ok_last_7d: number;
  };
  apps_by_category: { category: string; count: number }[];
  access_per_app: { id: number; name: string; slug: string; icon: string; color: string; is_active: boolean; users_count: number }[];
  sso_by_app: { application: string; count: number }[];
  recent_logins: { user: string; status: string; browser: string; os: string; device_type: string; ip_address: string; at: string }[];
  logins_trend: { day: string; count: number }[];
}

export interface AdminUser {
  id: number;
  name: string;
  cedula: string;
  email: string;
  is_active: boolean;
  is_admin: boolean;
}

export interface CatalogApplication {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  color: string;
  type: 'app' | 'form';
  is_active: boolean;
  sso_enabled?: boolean;
  /** True si la app expone la API de aprovisionamiento (rol/permisos por app). */
  provisionable?: boolean;
}

interface UserApplicationsResponse {
  user_id: number;
  application_ids: number[];
  access?: {
    application_id: number;
    abilities: string[];
    role?: string | null;
    permissions?: string[];
    companyPermissions?: Record<string, string[]>;
    companySellers?: Record<string, string>;
    companies?: string[];
  }[];
}

export interface AppAccess {
  application_id: number;
  abilities: string[];
  role?: string | null;
  permissions?: string[];
  companyPermissions?: Record<string, string[]>;
  companySellers?: Record<string, string>;
  companies?: string[];
}

/** Catálogo de roles y módulos que expone una app externa (SIGCOM/SIGCOMPRO). */
export interface AppModuleAction {
  key: string;
  label: string;
}

export interface AppModule {
  key: string;
  label: string;
  /** Acciones granulares (sub-permisos) del módulo (Sigcompro). */
  actions?: AppModuleAction[];
}

export interface AppModuleGroup {
  label: string;
  modules: AppModule[];
}

export interface AppCompany {
  id: string;
  name: string;
}

export interface AppProvisioningCatalog {
  roles: string[];
  groups: AppModuleGroup[];
  companies: AppCompany[];
}

export interface Role {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  is_admin: boolean;
  app_ids: number[];
  abilities: Record<string, string[]>;
  users_count: number;
}

export type RolePayload = {
  name: string;
  description: string | null;
  color: string | null;
  is_admin: boolean;
  app_ids: number[];
  abilities: Record<string, string[]>;
};

export interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  target_type: string | null;
  target_id: number | null;
  description: string | null;
  meta: Record<string, unknown> | null;
  ip_address: string | null;
  at: string | null;
}

export interface Paginated<T> {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
}

export interface SessionEntry {
  id: number;
  user: string | null;
  user_id: number;
  name: string;
  last_used_at: string | null;
  created_at: string | null;
  current?: boolean;
}

export interface ServiceHealth {
  id: number;
  name: string;
  slug: string;
  url: string;
  color: string | null;
  icon: string | null;
  logo: string | null;
  status: 'up' | 'down' | 'degraded';
  http_code: number | null;
  latency_ms: number;
}

export interface PresenceRow {
  id: number;
  user_id: number;
  user: string;
  cedula: string | null;
  date: string;
  present_seconds: number;
  absent_seconds: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
}

export interface PresenceUserTotal {
  user_id: number;
  user: string;
  present_seconds: number;
  absent_seconds: number;
  days: number;
}

export interface PresenceReport {
  from: string;
  to: string;
  rows: PresenceRow[];
  by_user: PresenceUserTotal[];
}

export interface PresenceRankingRow {
  user_id: number;
  user: string;
  cedula: string | null;
  days: number;
  present_hours: number;
  target_hours: number;
  avg_daily_hours: number;
  compliance_pct: number;
  consistency_pct: number;
  score: number;
}

export interface PresenceMonthly {
  month: string;
  target_daily_hours: number;
  summary: {
    users: number;
    total_hours: number;
    total_days: number;
    avg_daily_hours: number;
    avg_compliance: number;
    avg_consistency: number;
    top_user: string | null;
    top_score: number | null;
  };
  ranking: PresenceRankingRow[];
}

export interface ManagedApplication {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  url: string;
  category: string | null;
  color: string | null;
  logo: string | null;
  keywords: string | null;
  type: 'app' | 'form';
  sso_enabled: boolean;
  is_active: boolean;
  sort_order: number;
}

export type ApplicationPayload = Omit<ManagedApplication, 'id'>;

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export interface AnnouncementItem {
  id: number;
  title: string;
  body: string;
  published_by?: string;
  expires_at: string | null;
  created_at: string;
}

export interface SigcomResumen {
  pedidos_hoy: number;
  pedidos_ayer: number;
  cartera_pendiente: number;
  cotizaciones_abiertas: number;
}

export interface SigcomproResumen {
  pendientes: number;
  atrasados: number;
  alistados: number;
  despachados_hoy: number;
}

export interface CrossMetric {
  key: string;
  label: string;
  value: number;
  format?: 'number' | 'currency' | 'kg';
  tone?: 'default' | 'warn' | 'good';
  hint?: string;
}

export interface CrossApp {
  slug: string;
  name: string;
  icon: string | null;
  color: string | null;
  logo: string | null;
  url: string;
  status: 'ok' | 'error' | 'unavailable';
  metrics: CrossMetric[];
}

export interface CrossOverview {
  generated_at: string;
  apps: CrossApp[];
}

export interface ManagedUser {
  id: number;
  name: string;
  cedula: string;
  email: string | null;
  is_active: boolean;
  is_admin: boolean;
  role_id: number | null;
  role_name: string | null;
  has_siesa: boolean;
  application_ids: number[];
  has_face?: boolean;
  face_enrolled_at?: string | null;
  face_bypass_until?: string | null;
}

export interface UserPayload {
  name: string;
  cedula: string;
  email: string | null;
  password?: string;
  is_admin: boolean;
  is_active: boolean;
  role_id?: number | null;
  application_ids: number[];
  app_access?: {
    application_id: number;
    role?: string | null;
    permissions?: string[];
    abilities?: string[];
  }[];
  siesa_username?: string;
  siesa_password?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);

  getUsers(): Observable<AdminUser[]> {
    return this.http.get<AdminUser[]>('/api/admin/users');
  }

  getApplications(): Observable<CatalogApplication[]> {
    return this.http.get<CatalogApplication[]>('/api/admin/applications').pipe(
      map((res) => (Array.isArray(res) ? res : (res as { applications: CatalogApplication[] }).applications))
    );
  }

  /** Catálogo + lista de habilidades disponibles (para permisos granulares). */
  getPermissionCatalog(): Observable<{ applications: CatalogApplication[]; abilities: string[] }> {
    return this.http.get<{ applications: CatalogApplication[]; abilities: string[] }>('/api/admin/applications');
  }

  getUserApplications(userId: number): Observable<UserApplicationsResponse> {
    return this.http.get<UserApplicationsResponse>(`/api/admin/users/${userId}/applications`);
  }

  /** Refresca desde las apps externas el rol/permisos de un usuario y los devuelve. */
  refreshUserApplications(userId: number): Observable<UserApplicationsResponse> {
    return this.http.post<UserApplicationsResponse>(
      `/api/admin/users/${userId}/applications/refresh`,
      {}
    );
  }

  updateUserApplications(userId: number, applicationIds: number[]): Observable<UserApplicationsResponse> {
    return this.http.put<UserApplicationsResponse>(
      `/api/admin/users/${userId}/applications`,
      { application_ids: applicationIds }
    );
  }

  /** Importa a la suite los usuarios/roles/permisos existentes en las apps externas. */
  importUsersFromApps(): Observable<{
    summary: Record<string, { created?: number; linked?: number; total?: number; error?: string }>;
  }> {
    return this.http.post<{
      summary: Record<string, { created?: number; linked?: number; total?: number; error?: string }>;
    }>('/api/admin/provisioning/import', {});
  }

  /** Guarda el acceso granular (apps + habilidades + rol/permisos por app) de un usuario. */
  updateUserAccess(userId: number, access: AppAccess[]): Observable<UserApplicationsResponse> {
    return this.http.put<UserApplicationsResponse>(
      `/api/admin/users/${userId}/applications`,
      { access }
    );
  }

  /**
   * Catálogo de roles y módulos que expone una app externa. Normaliza las dos
   * formas del backend: `{ roles, permisos: apartados[] }` (SIGCOMPRO) y
   * `{ roles, grupos: [{label, modules}] }` (SIGCOM).
   */
  getAppCatalog(applicationId: number): Observable<AppProvisioningCatalog> {
    return this.http
      .get<{
        roles?: string[];
        grupos?: { label: string; modules: { key: string; label: string }[] }[];
        permisos?: {
          label: string;
          modulos: { key: string; label: string; acciones?: { key: string; label: string }[] }[];
        }[];
        companies?: { id: string; name: string }[];
      }>(`/api/admin/applications/${applicationId}/catalog`)
      .pipe(
        map((res) => {
          const groups: AppModuleGroup[] = res.grupos
            ? res.grupos.map((g) => ({ label: g.label, modules: g.modules ?? [] }))
            : (res.permisos ?? []).map((a) => ({
                label: a.label,
                modules: (a.modulos ?? []).map((m) => ({
                  key: m.key,
                  label: m.label,
                  actions: m.acciones ?? [],
                })),
              }));
          return { roles: res.roles ?? [], groups, companies: res.companies ?? [] };
        })
      );
  }

  // ---- Roles / grupos ----
  getRoles(): Observable<Role[]> {
    return this.http.get<Role[]>('/api/admin/roles');
  }

  createRole(payload: RolePayload): Observable<Role> {
    return this.http.post<Role>('/api/admin/roles', payload);
  }

  updateRole(id: number, payload: RolePayload): Observable<Role> {
    return this.http.put<Role>(`/api/admin/roles/${id}`, payload);
  }

  deleteRole(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/admin/roles/${id}`);
  }

  // ---- Bitácora de auditoría ----
  getAudit(params: Record<string, string | number> = {}): Observable<Paginated<AuditEntry>> {
    return this.http.get<Paginated<AuditEntry>>('/api/admin/audit', { params: params as never });
  }

  getAuditActions(): Observable<string[]> {
    return this.http.get<string[]>('/api/admin/audit/actions');
  }

  // ---- Sesiones activas ----
  getSessions(): Observable<SessionEntry[]> {
    return this.http.get<SessionEntry[]>('/api/admin/sessions');
  }

  revokeSession(tokenId: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/admin/sessions/${tokenId}`);
  }

  // ---- Estado de servicios ----
  getServicesHealth(): Observable<{ checked_at: string; services: ServiceHealth[] }> {
    return this.http.get<{ checked_at: string; services: ServiceHealth[] }>('/api/admin/services/health');
  }

  // ---- Dashboard ----
  getStats(days = 7): Observable<SuiteStats> {
    return this.http.get<SuiteStats>('/api/admin/stats', { params: { days } as never });
  }

  exportStats(from?: string, to?: string): Observable<Blob> {
    const params: Record<string, string> = {};
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    return this.http.get('/api/admin/stats/export', { params: params as never, responseType: 'blob' });
  }

  // ---- Presencia ----
  getPresence(from: string, to: string, userId?: number): Observable<PresenceReport> {
    const params: Record<string, string | number> = { from, to };
    if (userId) params['user_id'] = userId;
    return this.http.get<PresenceReport>('/api/admin/presence', { params: params as never });
  }

  exportPresence(from: string, to: string): Observable<Blob> {
    return this.http.get('/api/admin/presence/export', { params: { from, to } as never, responseType: 'blob' });
  }

  getPresenceMonthly(month: string): Observable<PresenceMonthly> {
    return this.http.get<PresenceMonthly>('/api/admin/presence/monthly', { params: { month } as never });
  }

  // ---- Gestión del catálogo de aplicaciones (CRUD) ----

  getManagedApplications(): Observable<ManagedApplication[]> {
    return this.http.get<ManagedApplication[]>('/api/admin/manage/applications');
  }

  createApplication(payload: ApplicationPayload): Observable<ManagedApplication> {
    return this.http.post<ManagedApplication>('/api/admin/manage/applications', payload);
  }

  updateApplication(id: number, payload: ApplicationPayload): Observable<ManagedApplication> {
    return this.http.put<ManagedApplication>(`/api/admin/manage/applications/${id}`, payload);
  }

  deleteApplication(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/admin/manage/applications/${id}`);
  }

  // ---- Gestión de usuarios (CRUD) ----

  getManagedUsers(): Observable<ManagedUser[]> {
    return this.http.get<ManagedUser[]>('/api/admin/manage/users');
  }

  createUser(payload: UserPayload): Observable<ManagedUser> {
    return this.http.post<ManagedUser>('/api/admin/manage/users', payload);
  }

  updateUser(id: number, payload: UserPayload): Observable<ManagedUser> {
    return this.http.put<ManagedUser>(`/api/admin/manage/users/${id}`, payload);
  }

  deleteUser(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/admin/manage/users/${id}`);
  }

  // ---- Biometría facial (2FA) ----

  enrollFace(userId: number, descriptors: number[][]): Observable<ManagedUser> {
    return this.http.post<ManagedUser>(`/api/admin/manage/users/${userId}/face`, { descriptors });
  }

  removeFace(userId: number): Observable<ManagedUser> {
    return this.http.delete<ManagedUser>(`/api/admin/manage/users/${userId}/face`);
  }

  grantFaceBypass(userId: number, minutes: number): Observable<ManagedUser> {
    return this.http.post<ManagedUser>(`/api/admin/manage/users/${userId}/face-bypass`, { minutes });
  }

  revokeFaceBypass(userId: number): Observable<ManagedUser> {
    return this.http.delete<ManagedUser>(`/api/admin/manage/users/${userId}/face-bypass`);
  }

  // ---- Notificaciones ----
  getNotifications(): Observable<NotificationItem[]> {
    return this.http.get<NotificationItem[]>('/api/notifications');
  }

  markNotificationRead(id: number): Observable<{ ok: boolean }> {
    return this.http.put<{ ok: boolean }>(`/api/notifications/${id}/read`, {});
  }

  markAllNotificationsRead(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>('/api/notifications/read-all', {});
  }

  // ---- Anuncios ----
  getActiveAnnouncements(): Observable<AnnouncementItem[]> {
    return this.http.get<AnnouncementItem[]>('/api/announcements/active');
  }

  markAnnouncementViewed(id: number): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`/api/announcements/${id}/viewed`, {});
  }

  getAdminAnnouncements(): Observable<AnnouncementItem[]> {
    return this.http.get<AnnouncementItem[]>('/api/admin/announcements');
  }

  createAnnouncement(payload: { title: string; body: string; expires_at?: string | null }): Observable<{ id: number }> {
    return this.http.post<{ id: number }>('/api/admin/announcements', payload);
  }

  updateAnnouncement(id: number, payload: { title: string; body: string; expires_at?: string | null }): Observable<{ ok: boolean }> {
    return this.http.put<{ ok: boolean }>(`/api/admin/announcements/${id}`, payload);
  }

  deleteAnnouncement(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`/api/admin/announcements/${id}`);
  }

  // ---- Resúmenes ejecutivos de apps externas ----
  getSigcomResumen(): Observable<SigcomResumen> {
    return this.http.get<SigcomResumen>('/api/admin/cross/sigcom');
  }

  getSigcomproResumen(): Observable<SigcomproResumen> {
    return this.http.get<SigcomproResumen>('/api/admin/cross/sigcompro');
  }

  /** Indicadores del día de todas las apps conectadas (Estadísticas generales). */
  getCrossOverview(): Observable<CrossOverview> {
    return this.http.get<CrossOverview>('/api/admin/cross');
  }
}
