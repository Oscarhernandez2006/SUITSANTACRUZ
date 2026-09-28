/**
 * Sistema visual único para todas las gráficas de Santa Cruz Suite.
 * Paleta profesional derivada de la identidad de marca (verde salvia + obsidiana).
 * Los colores tienen significado — no se asigna un color aleatorio por serie.
 */

/** Colores semánticos: cada uno comunica una intención concreta. */
export const CHART_SEMANTIC = {
  primary: '#2f8f4e', // verde bosque — métrica principal
  info: '#2D7D9A', // azul — información / SSO
  positive: '#2E9E5B', // verde — resultado positivo
  negative: '#D9534F', // rojo — resultado negativo / fallo
  warning: '#E0A83B', // ámbar — advertencia
  neutral: '#6B7B8C', // pizarra — datos secundarios
} as const;

/**
 * Paleta categórica armónica y sobria (sin colores saturados ni aleatorios).
 * Se usa cuando hay que distinguir categorías sin una semántica específica.
 */
export const CHART_CATEGORICAL = [
  '#2f8f4e', // forest
  '#2D7D9A', // teal
  '#E0A83B', // amber
  '#7C6BB0', // muted violet
  '#4A9D7F', // emerald
  '#E8734A', // terracotta
  '#C0567E', // rose
  '#6B7B8C', // slate
] as const;

/** Devuelve un color estable de la paleta categórica por índice. */
export function categoricalColor(index: number): string {
  return CHART_CATEGORICAL[index % CHART_CATEGORICAL.length];
}

export type ChartValueFormat = 'number' | 'compact' | 'currency' | 'percent' | 'hours';
