import { Injectable, signal } from '@angular/core';

const KEY = 'scs.sidebarCollapsed';

/** Estado global del layout (sidebar abierto/cerrado, persistido). */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly sidebarCollapsed = signal(localStorage.getItem(KEY) === '1');

  toggleSidebar(): void {
    const next = !this.sidebarCollapsed();
    this.sidebarCollapsed.set(next);
    localStorage.setItem(KEY, next ? '1' : '0');
  }
}
