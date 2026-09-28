import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ChartValueFormat, categoricalColor } from './chart-theme';
import { formatPercent, formatValueFull } from './chart-format';

export interface DonutDatum {
  label: string;
  value: number;
  color?: string;
}

/**
 * Dona — sólo para proporciones (partes de un todo). Muestra el total en el
 * centro y una leyenda con porcentajes; resaltar un segmento con hover/focus.
 */
@Component({
  selector: 'sc-donut-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dc">
      <div class="dc__ring">
        <svg viewBox="0 0 42 42" class="dc__svg" role="img" [attr.aria-label]="ariaLabel()">
          <circle class="dc__bg" cx="21" cy="21" r="15.915" />
          @for (s of segments(); track s.label; let i = $index) {
            <circle
              class="dc__seg"
              [class.dc__seg--dim]="hover() >= 0 && hover() !== i"
              cx="21"
              cy="21"
              r="15.915"
              fill="transparent"
              [attr.stroke]="s.color"
              [attr.stroke-width]="hover() === i ? 5 : 4"
              [attr.stroke-dasharray]="s.dash + ' ' + (100 - s.dash)"
              [attr.stroke-dashoffset]="s.offset"
              (pointerenter)="hover.set(i)"
              (pointerleave)="hover.set(-1)"
            >
              <title>{{ s.label }}: {{ fullValue(s.value) }} ({{ pctLabel(s.frac) }})</title>
            </circle>
          }
        </svg>
        <div class="dc__center">
          <span class="dc__total">{{ fullValue(total()) }}</span>
          <span class="dc__center-label">{{ centerLabel() }}</span>
        </div>
      </div>

      <ul class="dc__legend">
        @for (s of segments(); track s.label; let i = $index) {
          <li
            class="dc__legend-item"
            [class.dc__legend-item--dim]="hover() >= 0 && hover() !== i"
            (pointerenter)="hover.set(i)"
            (pointerleave)="hover.set(-1)"
          >
            <span class="dc__swatch" [style.background]="s.color"></span>
            <span class="dc__legend-label" [title]="s.label">{{ s.label }}</span>
            <span class="dc__legend-value">{{ fullValue(s.value) }}</span>
            <span class="dc__legend-pct">{{ pctLabel(s.frac) }}</span>
          </li>
        }
      </ul>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .dc {
        display: flex;
        align-items: center;
        gap: 1.25rem;
        flex-wrap: wrap;
      }
      .dc__ring {
        position: relative;
        width: 132px;
        height: 132px;
        flex-shrink: 0;
      }
      .dc__svg {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }
      .dc__bg {
        fill: transparent;
        stroke: #eef2f0;
        stroke-width: 4;
      }
      .dc__seg {
        transition: stroke-width var(--transition-fast), opacity var(--transition-fast);
        cursor: default;
      }
      .dc__seg--dim {
        opacity: 0.35;
      }
      .dc__center {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        pointer-events: none;
      }
      .dc__total {
        font-family: var(--font-heading);
        font-size: 1.4rem;
        font-weight: 700;
        color: var(--color-text-primary);
        line-height: 1;
      }
      .dc__center-label {
        font-size: 0.72rem;
        color: var(--color-text-muted);
        margin-top: 0.15rem;
      }
      .dc__legend {
        list-style: none;
        margin: 0;
        padding: 0;
        flex: 1;
        min-width: 160px;
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .dc__legend-item {
        display: grid;
        grid-template-columns: auto 1fr auto auto;
        align-items: center;
        gap: 0.5rem;
        padding: 0.3rem 0.35rem;
        border-radius: var(--radius-sm);
        transition: background var(--transition-fast), opacity var(--transition-fast);
      }
      .dc__legend-item:hover {
        background: rgba(47, 143, 78, 0.05);
      }
      .dc__legend-item--dim {
        opacity: 0.45;
      }
      .dc__swatch {
        width: 10px;
        height: 10px;
        border-radius: 3px;
        flex-shrink: 0;
      }
      .dc__legend-label {
        font-size: 0.82rem;
        color: var(--color-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .dc__legend-value {
        font-size: 0.82rem;
        font-weight: 700;
        color: var(--color-text-primary);
        font-variant-numeric: tabular-nums;
      }
      .dc__legend-pct {
        font-size: 0.74rem;
        color: var(--color-text-muted);
        min-width: 3.5ch;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class DonutChart {
  readonly data = input<DonutDatum[]>([]);
  readonly valueFormat = input<ChartValueFormat>('number');
  readonly centerLabel = input<string>('Total');
  readonly ariaLabel = input<string>('Gráfica de proporciones');

  readonly hover = signal(-1);

  readonly total = computed(() => this.data().reduce((sum, d) => sum + d.value, 0));

  readonly segments = computed(() => {
    const items = this.data();
    const total = this.total() || 1;
    let acc = 0;
    return items.map((d, i) => {
      const frac = d.value / total;
      const dash = frac * 100;
      // El offset gira el segmento; 25 alinea el inicio arriba tras el rotate(-90).
      const offset = 25 - acc * 100;
      acc += frac;
      return { ...d, frac, dash, offset, color: d.color || categoricalColor(i) };
    });
  });

  fullValue(v: number): string {
    return formatValueFull(v, this.valueFormat());
  }

  pctLabel(frac: number): string {
    return formatPercent(frac * 100, frac >= 0.1 ? 0 : 1);
  }
}
