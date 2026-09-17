import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TopNav } from '../top-nav/top-nav';
import { PresenceService } from '../../services/presence.service';

/** Layout persistente: el nav se monta una sola vez y no se recrea al navegar entre páginas. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, TopNav],
  template: `
    <app-top-nav />
    <router-outlet />
    @if (presence.status() === 'starting') {
      <div class="presence-boot" role="status" aria-live="polite" aria-busy="true">
        <div class="presence-boot__card">
          <span class="presence-boot__spinner" aria-hidden="true"></span>
          <h3>Iniciando monitoreo de presencia</h3>
          <p>Estamos preparando cámara y detector facial. Un momento, por favor...</p>
        </div>
      </div>
    }
  `,
  styleUrl: './shell.scss',
})
export class Shell implements OnInit {
  readonly presence = inject(PresenceService);

  ngOnInit(): void {
    // Monitoreo global: arranca al entrar a cualquier página autenticada (no
    // solo el dashboard) y sobrevive a recargas/navegación. Idempotente.
    if (localStorage.getItem('sc_tools_token')) {
      this.presence.init();
    }
  }
}
