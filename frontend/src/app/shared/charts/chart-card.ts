import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type ChartCardState = 'ready' | 'loading' | 'empty' | 'error';

/**
 * Contenedor estándar para toda gráfica de la suite: encabezado con título y
 * subtítulo, zona de acciones, y estados profesionales de carga, vacío y error.
 * Centraliza el estilo para poder cambiar el look global desde un único lugar.
 */
@Component({
  selector: 'sc-chart-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cc">
      <header class="cc__head">
        <div class="cc__titles">
          <h3 class="cc__title">{{ title() }}</h3>
          @if (subtitle()) {
            <p class="cc__subtitle">{{ subtitle() }}</p>
          }
        </div>
        <div class="cc__actions">
          <ng-content select="[chartActions]" />
        </div>
      </header>

      <div class="cc__body" [style.min-height.px]="bodyHeight()">
        @switch (state()) {
          @case ('loading') {
            <div class="cc__skeleton" role="status" aria-label="Cargando gráfica">
              <div class="cc__skeleton-shimmer"></div>
            </div>
          }
          @case ('empty') {
            <div class="cc__state">
              <span class="material-symbols-outlined cc__state-icon">bar_chart_off</span>
              <p class="cc__state-title">{{ emptyTitle() }}</p>
              <p class="cc__state-text">{{ emptyText() }}</p>
              @if (emptyActionLabel()) {
                <button type="button" class="cc__state-btn" (click)="action.emit()">
                  {{ emptyActionLabel() }}
                </button>
              }
            </div>
          }
          @case ('error') {
            <div class="cc__state">
              <span class="material-symbols-outlined cc__state-icon cc__state-icon--error">error</span>
              <p class="cc__state-title">No pudimos cargar esta información</p>
              <p class="cc__state-text">{{ errorText() }}</p>
              <button type="button" class="cc__state-btn" (click)="retry.emit()">
                <span class="material-symbols-outlined">refresh</span> Reintentar
              </button>
            </div>
          }
          @default {
            <ng-content />
          }
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .cc {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--color-white);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-sm);
      }
      .cc__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 1rem 1.25rem 0.75rem;
      }
      .cc__titles {
        min-width: 0;
      }
      .cc__title {
        margin: 0;
        font-family: var(--font-heading);
        font-size: 0.95rem;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: var(--color-text-primary);
      }
      .cc__subtitle {
        margin: 0.15rem 0 0;
        font-size: 0.78rem;
        color: var(--color-text-muted);
      }
      .cc__actions {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex-shrink: 0;
      }
      .cc__body {
        position: relative;
        flex: 1;
        padding: 0.25rem 1.25rem 1.25rem;
        display: flex;
        flex-direction: column;
      }
      /* Skeleton dimensionado al alto final para evitar layout shift */
      .cc__skeleton {
        flex: 1;
        border-radius: var(--radius-md);
        background: #eef2f0;
        overflow: hidden;
        position: relative;
      }
      .cc__skeleton-shimmer {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          90deg,
          rgba(255, 255, 255, 0) 0%,
          rgba(255, 255, 255, 0.6) 50%,
          rgba(255, 255, 255, 0) 100%
        );
        transform: translateX(-100%);
        animation: cc-shimmer 1.4s ease-in-out infinite;
      }
      @keyframes cc-shimmer {
        100% {
          transform: translateX(100%);
        }
      }
      .cc__state {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 0.35rem;
        padding: 1.5rem 1rem;
      }
      .cc__state-icon {
        font-size: 40px;
        color: var(--color-text-muted);
        opacity: 0.7;
      }
      .cc__state-icon--error {
        color: var(--color-alert);
        opacity: 0.9;
      }
      .cc__state-title {
        margin: 0.25rem 0 0;
        font-weight: 600;
        font-size: 0.9rem;
        color: var(--color-text-secondary);
      }
      .cc__state-text {
        margin: 0;
        font-size: 0.8rem;
        color: var(--color-text-muted);
        max-width: 34ch;
      }
      .cc__state-btn {
        margin-top: 0.5rem;
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.45rem 0.9rem;
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        background: var(--color-white);
        color: var(--color-accent);
        font-weight: 600;
        font-size: 0.82rem;
        cursor: pointer;
        transition: all var(--transition-fast);
      }
      .cc__state-btn:hover {
        border-color: var(--color-accent);
        background: rgba(47, 143, 78, 0.06);
      }
      .cc__state-btn .material-symbols-outlined {
        font-size: 18px;
      }
      @media (prefers-reduced-motion: reduce) {
        .cc__skeleton-shimmer {
          animation: none;
        }
      }
    `,
  ],
})
export class ChartCard {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly state = input<ChartCardState>('ready');
  readonly bodyHeight = input<number>(200);

  readonly emptyTitle = input<string>('No hay datos disponibles');
  readonly emptyText = input<string>('No existen registros para el período seleccionado.');
  readonly emptyActionLabel = input<string>('');
  readonly errorText = input<string>('Ocurrió un problema al obtener los datos. Intenta nuevamente.');

  readonly retry = output<void>();
  readonly action = output<void>();
}
