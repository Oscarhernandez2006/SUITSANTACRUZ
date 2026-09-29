import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, of, switchMap } from 'rxjs';
import { Sidebar } from '../../shared/sidebar/sidebar';
import { UserAppAccess } from '../../shared/user-app-access/user-app-access';
import { FaceService } from '../../services/face.service';
import { AuthService } from '../../services/auth.service';
import {
  AdminService,
  CatalogApplication,
  ManagedUser,
  Role,
  UserPayload,
} from '../../services/admin.service';

type WizardStep = 'info' | 'siesa' | 'apps' | 'summary';

interface UserFormModel {
  id: number | null;
  name: string;
  cedula: string;
  email: string;
  password: string;
  is_admin: boolean;
  is_active: boolean;
  role_id: number | null;
  siesa_username: string;
  siesa_password: string;
}

function emptyForm(): UserFormModel {
  return {
    id: null,
    name: '',
    cedula: '',
    email: '',
    password: '',
    is_admin: false,
    is_active: true,
    role_id: null,
    siesa_username: '',
    siesa_password: '',
  };
}

@Component({
  selector: 'app-users-admin',
  imports: [FormsModule, DatePipe, Sidebar, UserAppAccess],
  templateUrl: './users.html',
  styleUrl: './users.scss',
})
export class UsersAdmin implements OnInit {
  private adminService = inject(AdminService);
  private faceService = inject(FaceService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);

  readonly fullAdmin = !!this.auth.currentUser()?.is_admin;
  can(...perms: string[]): boolean { return this.auth.can(...perms); }

  readonly users = signal<ManagedUser[]>([]);
  readonly catalog = signal<CatalogApplication[]>([]);
  readonly roles = signal<Role[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly importing = signal(false);

  // ---- Asistente de usuario ----
  readonly appAccess = viewChild(UserAppAccess);
  readonly canSeeApps = this.auth.can('permissions');
  readonly canEditApps = this.auth.can('permissions.edit');
  readonly step = signal<WizardStep>('info');
  readonly steps = computed(() => {
    const list: { key: WizardStep; label: string; icon: string }[] = [
      { key: 'info', label: 'Información', icon: 'badge' },
      { key: 'siesa', label: 'Siesa', icon: 'cloud_sync' },
    ];
    if (this.canSeeApps) list.push({ key: 'apps', label: 'Aplicaciones', icon: 'apps' });
    list.push({ key: 'summary', label: 'Resumen', icon: 'task_alt' });
    return list;
  });
  readonly stepIndex = computed(() => this.steps().findIndex((s) => s.key === this.step()));

  readonly modalOpen = signal(false);
  readonly editing = signal(false);
  readonly form = signal<UserFormModel>(emptyForm());
  readonly formError = signal('');
  readonly showPassword = signal(false);
  readonly showSiesaPassword = signal(false);

  readonly confirmDelete = signal<ManagedUser | null>(null);

  readonly toastMessage = signal('');
  readonly toastVisible = signal(false);

  readonly searchQuery = signal('');

  // --- Biometría facial (enrolamiento y bypass) ---
  readonly faceModalUser = signal<ManagedUser | null>(null);
  readonly faceSamples = signal<number[][]>([]);
  readonly faceCapturing = signal(false);
  readonly faceSaving = signal(false);
  readonly faceModelsLoading = signal(false);
  readonly faceMessage = signal('');
  readonly faceError = signal('');
  bypassMinutes = 60;
  private faceStream: MediaStream | null = null;
  readonly enrollVideo = viewChild<ElementRef<HTMLVideoElement>>('enrollVideo');

  readonly filteredUsers = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const roleId = this.roleFilter();
    const status = this.statusFilter();
    const type = this.typeFilter();
    const face = this.faceFilter();
    const siesa = this.siesaFilter();
    const appId = this.appFilter();
    return this.users().filter((u) => {
      if (roleId === 0 && u.role_id) return false;
      if (roleId && u.role_id !== roleId) return false;
      if (status !== 'all' && u.is_active !== (status === 'active')) return false;
      if (type !== 'all' && u.is_admin !== (type === 'admin')) return false;
      if (face !== 'all' && !!u.has_face !== (face === 'with')) return false;
      if (siesa !== 'all' && u.has_siesa !== (siesa === 'with')) return false;
      if (appId && !u.application_ids.includes(appId)) return false;
      return (
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.cedula.toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q)
      );
    });
  });

  /** Filtro por grupo (llega como ?grupo=ID desde la página de Grupos); 0 = sin grupo. */
  readonly roleFilter = signal<number | null>(null);
  readonly statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  readonly typeFilter = signal<'all' | 'admin' | 'regular'>('all');
  readonly faceFilter = signal<'all' | 'with' | 'without'>('all');
  readonly siesaFilter = signal<'all' | 'with' | 'without'>('all');
  readonly appFilter = signal<number | null>(null);

  readonly activeFilters = computed(() =>
    [
      this.roleFilter() !== null,
      this.statusFilter() !== 'all',
      this.typeFilter() !== 'all',
      this.faceFilter() !== 'all',
      this.siesaFilter() !== 'all',
      this.appFilter() !== null,
    ].filter(Boolean).length,
  );

  ngOnInit(): void {
    const grupo = Number(this.route.snapshot.queryParamMap.get('grupo'));
    if (grupo) this.roleFilter.set(grupo);
    this.load();
  }

  setRoleFilter(id: number | null): void {
    this.roleFilter.set(id);
    this.router.navigate([], { queryParams: id ? { grupo: id } : {} });
  }

  clearFilters(): void {
    this.setRoleFilter(null);
    this.statusFilter.set('all');
    this.typeFilter.set('all');
    this.faceFilter.set('all');
    this.siesaFilter.set('all');
    this.appFilter.set(null);
  }

  private load(): void {
    this.loading.set(true);
    this.adminService.getManagedUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.adminService.getApplications().subscribe({
      next: (apps) => this.catalog.set(apps),
      error: () => this.catalog.set([]),
    });
    this.adminService.getRoles().subscribe({
      next: (roles) => this.roles.set(roles),
      error: () => this.roles.set([]),
    });
  }

  openCreate(): void {
    this.form.set(emptyForm());
    this.editing.set(false);
    this.formError.set('');
    this.showPassword.set(false);
    this.showSiesaPassword.set(false);
    this.step.set('info');
    this.modalOpen.set(true);
  }

  openEdit(user: ManagedUser): void {
    this.form.set({
      id: user.id,
      name: user.name,
      cedula: user.cedula,
      email: user.email ?? '',
      password: '',
      is_admin: user.is_admin,
      is_active: user.is_active,
      role_id: user.role_id,
      siesa_username: '',
      siesa_password: '',
    });
    this.editing.set(true);
    this.formError.set('');
    this.showPassword.set(false);
    this.showSiesaPassword.set(false);
    this.step.set('info');
    this.modalOpen.set(true);
  }

  closeModal(): void {
    if (this.saving()) return;
    this.modalOpen.set(false);
  }

  updateField<K extends keyof UserFormModel>(key: K, value: UserFormModel[K]): void {
    this.form.set({ ...this.form(), [key]: value });
  }

  /** Valida el paso de información; devuelve el error o cadena vacía. */
  private infoError(): string {
    const f = this.form();
    if (!f.name.trim() || !f.cedula.trim()) return 'Nombre y cédula son obligatorios.';
    const pwd = f.password.trim();
    if (!this.editing() && pwd.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
    if (this.editing() && pwd && pwd.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
    return '';
  }

  goToStep(key: WizardStep): void {
    const target = this.steps().findIndex((s) => s.key === key);
    if (target > 0 && this.stepIndex() === 0) {
      const err = this.infoError();
      this.formError.set(err);
      if (err) return;
    }
    this.formError.set('');
    this.step.set(key);
  }

  nextStep(): void {
    const next = this.steps()[this.stepIndex() + 1];
    if (next) this.goToStep(next.key);
  }

  prevStep(): void {
    const prev = this.steps()[this.stepIndex() - 1];
    if (prev) this.goToStep(prev.key);
  }

  roleName(id: number | null): string {
    return this.roles().find((r) => r.id === id)?.name ?? 'Sin grupo';
  }

  /** Importa a la suite los usuarios/roles/permisos que ya existen en las apps externas. */
  importFromApps(): void {
    if (this.importing()) return;
    this.importing.set(true);
    this.adminService.importUsersFromApps().subscribe({
      next: (res) => {
        this.importing.set(false);
        const parts = Object.entries(res.summary).map(([slug, s]) =>
          s.error ? `${slug}: error` : `${slug}: +${s.created ?? 0} nuevos, ${s.linked ?? 0} vinculados`,
        );
        this.showToast(`Importado — ${parts.join(' · ')}`);
        this.load();
      },
      error: () => {
        this.importing.set(false);
        this.showToast('Error al importar desde las apps');
      },
    });
  }

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  toggleSiesaPassword(): void {
    this.showSiesaPassword.update((v) => !v);
  }

  save(): void {
    if (this.saving()) return;
    const f = this.form();

    const err = this.infoError();
    if (err) {
      this.formError.set(err);
      this.step.set('info');
      return;
    }

    const email = (f.email ?? '').trim();
    const payload: UserPayload = {
      name: f.name.trim(),
      cedula: f.cedula.trim(),
      email: email || null,
      is_admin: f.is_admin,
      is_active: f.is_active,
      role_id: f.role_id,
    };
    if (f.password.trim()) payload.password = f.password;
    if (f.siesa_username.trim()) payload.siesa_username = f.siesa_username.trim();
    if (f.siesa_password.trim()) payload.siesa_password = f.siesa_password;

    this.saving.set(true);
    this.formError.set('');

    const request$ =
      this.editing() && f.id
        ? this.adminService.updateUser(f.id, payload)
        : this.adminService.createUser(payload);
    const access = this.appAccess();

    // Primero el usuario; luego sus accesos a apps (necesitan el id en un alta).
    request$
      .pipe(switchMap((user): Observable<unknown> => {
        const id = f.id ?? (user as ManagedUser | null)?.id;
        return access && id && this.canEditApps ? access.persist(id) : of(null);
      }))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.modalOpen.set(false);
          this.showToast(this.editing() ? 'Usuario actualizado' : 'Usuario creado');
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          const errors = err?.error?.errors;
          const msg = errors
            ? Object.values(errors).flat().join(' ')
            : err?.error?.message || 'No se pudo guardar el usuario.';
          this.formError.set(msg);
        },
      });
  }

  askDelete(user: ManagedUser): void {
    this.confirmDelete.set(user);
  }

  cancelDelete(): void {
    this.confirmDelete.set(null);
  }

  doDelete(): void {
    const user = this.confirmDelete();
    if (!user) return;
    this.adminService.deleteUser(user.id).subscribe({
      next: () => {
        this.confirmDelete.set(null);
        this.showToast('Usuario eliminado');
        this.load();
      },
      error: (err) => {
        this.confirmDelete.set(null);
        this.showToast(err?.error?.message || 'No se pudo eliminar el usuario');
      },
    });
  }

  appName(appId: number): string {
    return this.catalog().find((a) => a.id === appId)?.name ?? '';
  }

  /** Rol legible del usuario. */
  roleLabel(user: ManagedUser): string {
    return user.role_name ?? (user.is_admin ? 'Administrador' : 'Usuario');
  }

  goBack(): void {
    this.router.navigate(['/portal']);
  }

  // ============================================================
  // Biometría facial
  // ============================================================

  /** ¿El usuario tiene un bypass facial vigente? */
  isBypassActive(user: ManagedUser): boolean {
    return !!user.face_bypass_until && new Date(user.face_bypass_until).getTime() > Date.now();
  }

  /** Abre el modal de enrolamiento y enciende la cámara. */
  async openFaceModal(user: ManagedUser): Promise<void> {
    this.faceModalUser.set(user);
    this.faceSamples.set([]);
    this.faceError.set('');
    this.faceMessage.set('Preparando la c\u00e1mara...');
    this.faceModelsLoading.set(true);
    try {
      await this.faceService.loadModels();
      await new Promise((r) => setTimeout(r, 0));
      const video = this.enrollVideo()?.nativeElement;
      if (!video) throw new Error('sin cámara');
      this.faceStream = await this.faceService.startCamera(video);
      this.faceModelsLoading.set(false);
      this.faceMessage.set('Captura 3 tomas del rostro desde distintos \u00e1ngulos.');
    } catch {
      this.faceModelsLoading.set(false);
      this.faceError.set('No se pudo acceder a la c\u00e1mara o a los modelos.');
    }
  }

  /** Captura una muestra (descriptor) del rostro en vivo. */
  async captureSample(): Promise<void> {
    const video = this.enrollVideo()?.nativeElement;
    if (!video || this.faceCapturing()) return;
    this.faceCapturing.set(true);
    this.faceError.set('');
    try {
      const descriptor = await this.faceService.detectDescriptor(video);
      if (!descriptor) {
        this.faceError.set('No se detect\u00f3 un rostro claro. Intenta de nuevo.');
      } else {
        this.faceSamples.set([...this.faceSamples(), this.faceService.toArray(descriptor)]);
        this.faceMessage.set(`Tomas capturadas: ${this.faceSamples().length} / 3`);
      }
    } catch {
      this.faceError.set('Error al analizar el rostro.');
    } finally {
      this.faceCapturing.set(false);
    }
  }

  /** Guarda el enrolamiento (envía los descriptores al backend). */
  saveFace(): void {
    const user = this.faceModalUser();
    if (!user || this.faceSaving() || this.faceSamples().length === 0) return;
    this.faceSaving.set(true);
    this.adminService.enrollFace(user.id, this.faceSamples()).subscribe({
      next: () => {
        this.faceSaving.set(false);
        this.closeFaceModal();
        this.showToast('Rostro enrolado correctamente');
        this.load();
      },
      error: (err) => {
        this.faceSaving.set(false);
        this.faceError.set(err?.error?.message || 'No se pudo guardar el rostro.');
      },
    });
  }

  /** Elimina el rostro enrolado de un usuario. */
  removeFace(user: ManagedUser): void {
    this.adminService.removeFace(user.id).subscribe({
      next: () => {
        this.showToast('Rostro eliminado');
        this.load();
      },
      error: (err) => this.showToast(err?.error?.message || 'No se pudo eliminar el rostro'),
    });
  }

  /** Otorga un bypass temporal del factor facial. */
  grantBypass(user: ManagedUser): void {
    const minutes = Number(this.bypassMinutes) || 60;
    this.adminService.grantFaceBypass(user.id, minutes).subscribe({
      next: () => {
        this.showToast(`Bypass otorgado por ${minutes} min`);
        this.load();
      },
      error: (err) => this.showToast(err?.error?.message || 'No se pudo otorgar el bypass'),
    });
  }

  /** Revoca el bypass temporal del factor facial. */
  revokeBypass(user: ManagedUser): void {
    this.adminService.revokeFaceBypass(user.id).subscribe({
      next: () => {
        this.showToast('Bypass revocado');
        this.load();
      },
      error: (err) => this.showToast(err?.error?.message || 'No se pudo revocar el bypass'),
    });
  }

  /** Cierra el modal de enrolamiento y apaga la cámara. */
  closeFaceModal(): void {
    if (this.faceSaving()) return;
    this.faceService.stopCamera(this.enrollVideo()?.nativeElement ?? null, this.faceStream);
    this.faceStream = null;
    this.faceModalUser.set(null);
    this.faceSamples.set([]);
    this.faceMessage.set('');
    this.faceError.set('');
  }

  private showToast(message: string): void {
    this.toastMessage.set(message);
    this.toastVisible.set(true);
    setTimeout(() => this.toastVisible.set(false), 2500);
  }
}
