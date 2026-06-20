'use client';

/**
 * Portfolio gating is NEUTRALIZED in the Anu Imports fork.
 *
 * The original NB tracker split SKUs into NB / Anu books behind a passcode.
 * This app tracks a single book (the import portfolio), so there is nothing
 * to hide: the hook always returns 'all' and the setter is a no-op.
 *
 * The Portfolio type + hook signature are kept so existing callers
 * (app/forecast, app/stores/[storeNumber], app/me, app/territories) compile
 * unchanged. The backend keeps accepting ?portfolio= for API compatibility
 * but returns ALL tracked SKUs for any value.
 */
export type Portfolio = 'NB' | 'Anu' | 'all';

const noop = (_p: Portfolio) => {};

export function useActivePortfolio(): [Portfolio, (p: Portfolio) => void] {
  return ['all', noop];
}
