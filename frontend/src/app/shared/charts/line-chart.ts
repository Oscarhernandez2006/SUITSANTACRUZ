import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { ResponsiveChart } from './responsive-chart';
import { ChartValueFormat } from './chart-theme';
import {
  formatDateLong,
  formatDateShort,
  formatValue,
  formatValueFull,
  deltaPercent,
} from './chart-format';

export interface LinePoint {
  x: string;
  y: number;
}

interface Geometry {
  path: string;
  area: string;
  coords: { cx: number; cy: number; p: LinePoint; i: number }[];
  gridY: { y: number; label: string }[];
  xLabels: { x: number; label: string }[];
  padL: number;
  padT: number;
  innerH: number;
  w: number;
  h: number;
}

/**
 * Gráfica de líneas con área — pensada para tendencias temporales.
 * Grid sutil, ejes con formato regional, tooltip con comparación vs. período previo.
 */
@Component({
  selector: 'sc-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lc" [style.height.px]="height()">
      @if (geo(); as g) {
        <svg
          class="lc__svg"
          [attr.width]="g.w"
          [attr.height]="g.h"
          [attr.viewBox]="'0 0 ' + g.w + ' ' + g.h"
          role="img"
          [attr.aria-label]="ariaLabel()"
          (pointermove)="onMove($event, g)"
          (pointerleave)="hover.set(-1)"
        >
          <defs>
            <linearGradient [attr.id]="gradId" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" [attr.stop-color]="color()" stop-opacity="0.22" />
              <stop offset="100%" [attr.stop-color]="color()" stop-opacity="0" />
            </linearGradient>
          </defs>

          @for (gl of g.gridY; track gl.label) {
            <line class="lc__grid" [attr.x1]="g.padL" [attr.x2]="g.w - 12" [attr.y1]="gl.y" [attr.y2]="gl.y" />
            <text class="lc__ytick" [attr.x]="g.padL - 8" [attr.y]="gl.y + 3" text-anchor="end">{{ gl.label }}</text>
          }

          <path class="lc__area" [attr.d]="g.area" [attr.fill]="'url(#' + gradId + ')'" />
          <path class="lc__line" [attr.d]="g.path" [attr.stroke]="color()" />

          @for (xl of g.xLabels; track xl.x) {
            <text class="lc__xtick" [attr.x]="xl.x" [attr.y]="g.h - 6" text-anchor="middle">{{ xl.label }}</text>
          }

          @if (hover() >= 0 && g.coords[hover()]; as c) {
            <line class="lc__cursor" [attr.x1]="c.cx" [attr.x2]="c.cx" [attr.y1]="g.padT" [attr.y2]="g.padT + g.innerH" />
            <circle class="lc__dot" [attr.cx]="c.cx" [attr.cy]="c.cy" r="4.5" [attr.stroke]="color()" />
          }
        </svg>

        @if (hover() >= 0 && g.coords[hover()]; as c) {
          <div class="lc__tip" [style.left.px]="tipLeft(c.cx, g.w)" [style.top.px]="c.cy">
            <span class="lc__tip-label">{{ title() }}</span>
            <span class="lc__tip-date">{{ dateIsDate() ? longDate(c.p.x) : c.p.x }}</span>
            <span class="lc__tip-value">{{ fullValue(c.p.y) }}</span>
            @if (deltaLabel(c.i); as d) {
              <span class="lc__tip-delta" [class.lc__tip-delta--up]="d.up" [class.lc__tip-delta--down]="!d.up">
                {{ d.text }} vs. anterior
              </span>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .lc {
        position: relative;
        width: 100%;
      }
      .lc__svg {
        display: block;
        overflow: visible;
      }
      .lc__grid {
        stroke: var(--color-border);
        stroke-opacity: 0.55;
        stroke-width: 1;
        shape-rendering: crispEdges;
      }
      .lc__ytick,
      .lc__xtick {
        fill: var(--color-text-muted);
        font-size: 10px;
        font-family: var(--font-body);
      }
      .lc__line {
        fill: none;
        stroke-width: 2.25;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .lc__cursor {
        stroke: var(--color-text-muted);
        stroke-width: 1;
        stroke-dasharray: 3 3;
        stroke-opacity: 0.7;
      }
      .lc__dot {
        fill: var(--color-white);
        stroke-width: 2.5;
      }
      .lc__tip {
        position: absolute;
        transform: translate(-50%, calc(-100% - 14px));
        display: flex;
        flex-direction: column;
        gap: 1px;
        padding: 0.5rem 0.7rem;
        background: var(--color-primary);
        color: var(--color-white);
        border-radius: var(--radius-sm);
        box-shadow: var(--shadow-lg);
        pointer-events: none;
        white-space: nowrap;
        z-index: 5;
      }
      .lc__tip-label {
        font-size: 0.68rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        opacity: 0.7;
      }
      .lc__tip-date {
        font-size: 0.72rem;
        opacity: 0.85;
      }
      .lc__tip-value {
        font-family: var(--font-heading);
        font-size: 1rem;
        font-weight: 700;
      }
      .lc__tip-delta {
        font-size: 0.72rem;
        font-weight: 600;
      }
      .lc__tip-delta--up {
        color: #8fe08f;
      }
      .lc__tip-delta--down {
        color: #f2a99a;
      }
    `,
  ],
})
export class LineChart extends ResponsiveChart {
  readonly points = input<LinePoint[]>([]);
  readonly title = input<string>('Valor');
  readonly color = input<string>('#2f8f4e');
  readonly valueFormat = input<ChartValueFormat>('number');
  readonly height = input<number>(200);
  readonly dateIsDate = input<boolean>(true);
  readonly ariaLabel = input<string>('Gráfica de tendencia');

  readonly hover = signal(-1);
  readonly gradId = `lc-grad-${Math.random().toString(36).slice(2, 8)}`;

  readonly geo = computed<Geometry | null>(() => {
    const w = this.width();
    const h = this.height();
    const data = this.points();
    if (w <= 0 || data.length === 0) return null;

    const padL = 44;
    const padR = 12;
    const padT = 12;
    const padB = 22;
    const innerW = Math.max(1, w - padL - padR);
    const innerH = Math.max(1, h - padT - padB);

    const rawMax = Math.max(1, ...data.map((d) => d.y));
    const yMax = niceMax(rawMax);
    const n = data.length;

    const xAt = (i: number) => (n <= 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW);
    const yAt = (v: number) => padT + innerH - (v / yMax) * innerH;

    const coords = data.map((p, i) => ({ cx: xAt(i), cy: yAt(p.y), p, i }));
    const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.cx.toFixed(1)},${c.cy.toFixed(1)}`).join(' ');
    const baseline = yAt(0);
    const area = `${line} L${coords[coords.length - 1].cx.toFixed(1)},${baseline.toFixed(1)} L${coords[0].cx.toFixed(1)},${baseline.toFixed(1)} Z`;

    const gridY = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      y: padT + innerH - f * innerH,
      label: formatValue(yMax * f, this.valueFormat()),
    }));

    const maxLabels = this.isCompact() ? 4 : 7;
    const step = Math.max(1, Math.ceil(n / maxLabels));
    const xLabels = coords
      .filter((_, i) => i % step === 0 || i === n - 1)
      .map((c) => ({ x: c.cx, label: this.dateIsDate() ? formatDateShort(c.p.x) : c.p.x }));

    return { path: line, area, coords, gridY, xLabels, padL, padT, innerH, w, h };
  });

  onMove(ev: PointerEvent, g: Geometry): void {
    const rect = (ev.currentTarget as SVGElement).getBoundingClientRect();
    const px = ev.clientX - rect.left;
    let nearest = 0;
    let best = Infinity;
    for (const c of g.coords) {
      const d = Math.abs(c.cx - px);
      if (d < best) {
        best = d;
        nearest = c.i;
      }
    }
    this.hover.set(nearest);
  }

  tipLeft(cx: number, w: number): number {
    return Math.min(Math.max(cx, 70), w - 70);
  }

  fullValue(v: number): string {
    return formatValueFull(v, this.valueFormat());
  }

  longDate(iso: string): string {
    return formatDateLong(iso);
  }

  deltaLabel(i: number): { text: string; up: boolean } | null {
    if (i <= 0) return null;
    const data = this.points();
    const d = deltaPercent(data[i].y, data[i - 1].y);
    if (d === null) return null;
    const up = d >= 0;
    const sign = up ? '+' : '';
    return { text: `${sign}${d.toFixed(1)} %`, up };
  }
}

/** Redondea el máximo a un valor "bonito" para que el eje respire. */
function niceMax(value: number): number {
  if (value <= 5) return Math.ceil(value);
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}
