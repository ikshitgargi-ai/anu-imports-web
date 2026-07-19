/**
 * Canonical chart palette per APP_UI_SPEC.md (DESIGN_TOKENS.json chart_series_order).
 * Every Recharts usage imports from here; no hand-tuned hexes in chart components.
 */
export const CHART_SERIES = [
  '#d8ad58',
  '#408eff',
  '#9c2848',
  '#2dd4a8',
  '#efd596',
  '#6da7ff',
] as const;

export const CHART_GRID = 'rgba(159,168,187,0.12)';
export const CHART_TICK = '#6b7691';
export const CHART_LABEL = '#e6ecf5';
export const CHART_TOOLTIP_BG = '#101c33';
export const CHART_TOOLTIP_BORDER = 'rgba(216,173,88,0.13)';

/* Status colors are load-bearing: green = listed, amber = delisting, red = delisted */
export const STATUS = {
  listed: '#2dd4a8',
  delisting: '#fdcb6e',
  delisted: '#e5484d',
} as const;
