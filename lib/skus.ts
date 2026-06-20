/**
 * Shared tracked-SKU registry — the Anu Imports portfolio at LCBO.
 * Mirrors SOD_TRACKED_SKUS in the Flask backend (anu-imports-tracker).
 *
 * Prefer api.sodProducts() when a live list is fine; use this const for
 * selects that must render instantly/offline (e.g. "I saw it on shelf").
 *
 * GianChand (0047777) and Rutland Square (0049902) are pending in the SOD
 * feed — zero inventory rows until LCBO includes them, then they activate.
 */
export const TRACKED_SKUS: Array<{ sku: string; label: string }> = [
  { sku: '0045378', label: 'Rock Paper Rum Indian Spiced' },
  { sku: '0046340', label: 'Goenchi Cashew Feni' },
  { sku: '0046343', label: 'Goenchi Coconut Feni' },
  { sku: '0046282', label: 'Fratelli Classic Shiraz' },
  { sku: '0046285', label: 'Fratelli Chenin Blanc' },
  { sku: '0046286', label: 'Fratelli Sauvignon Blanc' },
  { sku: '0046287', label: 'Fratelli Cabernet Sauvignon' },
  { sku: '0047777', label: 'GianChand Single Malt Whisky' },
  { sku: '0049902', label: 'Rutland Square Chai Spiced Gin' },
];
