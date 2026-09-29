import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Sidebar } from '../../shared/sidebar/sidebar';
import { AdminService, AnnouncementItem } from '../../services/admin.service';
import { AuthService } from '../../services/auth.service';

type Form = { title: string; body: string; expires_at: string };

function emptyForm(): Form { return { title: '', body: '', expires_at: '' }; }

@Component({
  selector: 'app-announcements-admin',
  standalone: true,
  imports: [Sidebar, DatePipe, FormsModule],
  templateUrl: './announcements.html',
  styleUrl: './announcements.scss',
})
export class AnnouncementsAdmin implements OnInit {
  private svc = inject(AdminService);
  private auth = inject(AuthService);
  can(...perms: string[]): boolean { return this.auth.can(...perms); }

  readonly items = signal<AnnouncementItem[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly modalOpen = signal(false);
  readonly editing = signal<AnnouncementItem | null>(null);
  readonly form = signal<Form>(emptyForm());
  readonly toast = signal('');
  readonly toastVisible = signal(false);

  ngOnInit(): void { this.load(); }

  private load(): void {
    this.loading.set(true);
    this.svc.getAdminAnnouncements().subscribe({
      next: (d) => { this.items.set(d); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openCreate(): void {
    this.form.set(emptyForm());
    this.editing.set(null);
    this.modalOpen.set(true);
  }

  openEdit(item: AnnouncementItem): void {
    this.form.set({ title: item.title, body: item.body, expires_at: item.expires_at?.slice(0, 10) ?? '' });
    this.editing.set(item);
    this.modalOpen.set(true);
  }

  closeModal(): void { this.modalOpen.set(false); }

  save(): void {
    if (this.saving()) return;
    const f = this.form();
    if (!f.title.trim() || !f.body.trim()) return;
    this.saving.set(true);
    const payload = { title: f.title.trim(), body: f.body.trim(), expires_at: f.expires_at || null };
    const ed = this.editing();
    const req$: import('rxjs').Observable<unknown> = ed
      ? this.svc.updateAnnouncement(ed.id, payload)
      : this.svc.createAnnouncement(payload);
    req$.subscribe({
      next: () => { this.saving.set(false); this.modalOpen.set(false); this.showToast(ed ? 'Anuncio actualizado' : 'Anuncio publicado'); this.load(); },
      error: () => { this.saving.set(false); },
    });
  }

  delete(item: AnnouncementItem): void {
    if (!confirm(`¿Eliminar el anuncio "${item.title}"?`)) return;
    this.svc.deleteAnnouncement(item.id).subscribe({ next: () => { this.showToast('Anuncio eliminado'); this.load(); } });
  }

  updateForm<K extends keyof Form>(key: K, value: Form[K]): void { this.form.set({ ...this.form(), [key]: value }); }

  isExpired(item: AnnouncementItem): boolean {
    return !!item.expires_at && new Date(item.expires_at) < new Date();
  }

  private showToast(msg: string): void {
    this.toast.set(msg); this.toastVisible.set(true);
    setTimeout(() => this.toastVisible.set(false), 2500);
  }
}
