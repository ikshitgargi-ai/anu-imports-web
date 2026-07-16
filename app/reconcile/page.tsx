'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Scale } from 'lucide-react';
import { api, ReconcileRow } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';

/**
 * RECONCILE — the never-silently-wrong check.
 *
 * Three independent witnesses per store × SKU: the LCBO SOD feed, the
 * lcbo.com live page, and the rep's own shelf observation. Any disagreement
 * gets a flag instead of being averaged away.
 */

const FLAG_HINT: Record<string, string> = {
  MATCH: 'All sources agree',
  SOD_LAGS_LIVE: 'lcbo.com shows stock the SOD feed has not caught up to',
  LIVE_LAGS_SOD: 'SOD shows stock lcbo.com hides (often low/no stock display)',
  MISSING_FROM_SOD: 'Live sees it, SOD does not — watch the feed',
  MISSING_FROM_LIVE: 'SOD sees it, lcbo.com hides it — usually near-zero shelf',
  REP_MISMATCH: 'Rep observation disagrees with both feeds',
};

export default function ReconcilePage() {
  const [flag, setFlag] = useState('');
  const data = useQuery({ queryKey: ['reconcile', 7], queryFn: () => api.reconcile(7), retry: 1 });

  const rows = useMemo(() => {
    const all = data.data?.rows ?? [];
    return flag ? all.filter((r) => r.flag === flag) : all;
  }, [data.data, flag]);

  const summary = data.data?.summary ?? {};

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
          <Scale size={24} className="text-[var(--color-accent)]" />
          Reconcile
        </h1>
        <p className="text-sm text-[var(--color-muted)]">
          SOD feed vs lcbo.com vs rep shelf checks, per store and SKU.
          {data.data?.mode ? ` Mode: ${data.data.mode}.` : ''}
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFlag('')}
          className={`badge ${flag === '' ? 'status-active' : ''}`}
        >
          All ({data.data?.rows.length ?? 0})
        </button>
        {Object.entries(summary).map(([f, n]) => (
          <button
            key={f}
            onClick={() => setFlag(f === flag ? '' : f)}
            className={`badge ${flag === f ? 'status-active' : ''}`}
            title={FLAG_HINT[f] ?? ''}
          >
            {f.replace(/_/g, ' ')} ({n})
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{rows.length} rows</CardTitle>
        </CardHeader>
        <CardContent>
          {data.isLoading && <div className="py-8 text-center text-sm text-[var(--color-muted)]">Cross-checking…</div>}
          {data.isError && (
            <div className="py-8 text-center text-sm text-[var(--color-muted)]">
              Reconcile endpoint busy or deploying. Retry shortly.
            </div>
          )}
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="data-table table-to-cards min-w-[920px] sm:min-w-0">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Store</th>
                  <th>SOD</th>
                  <th>lcbo.com</th>
                  <th>Rep saw</th>
                  <th>Flag</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <Row key={`${r.sku}-${r.store_number}-${i}`} r={r} />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ r }: { r: ReconcileRow }) {
  return (
    <tr>
      <td data-label="Product" className="font-medium">
        {r.product_name || r.brand}
        <div className="text-[11px] font-normal text-[var(--color-muted)]">#{r.sku}</div>
      </td>
      <td data-label="Store">
        #{r.store_number}
        <div className="text-[11px] text-[var(--color-muted)]">
          {[r.account, (r as { address?: string }).address, r.city].filter(Boolean).join(' · ')}
        </div>
      </td>
      <td data-label="SOD" className="tabular-nums">
        {r.sod_on_hand ?? '—'}
        <div className="text-[11px] text-[var(--color-muted)]">
          {r.sod_snapshot_date ? formatDate(r.sod_snapshot_date) : ''}
        </div>
      </td>
      <td data-label="lcbo.com" className="tabular-nums">
        {r.live_qty ?? '—'}
        <div className="text-[11px] text-[var(--color-muted)]">
          {r.live_checked_at ? formatDate(r.live_checked_at) : ''}
        </div>
      </td>
      <td data-label="Rep saw" className="text-xs">
        {r.rep_outcome ? (
          <>
            {r.rep_outcome}
            <div className="text-[11px] text-[var(--color-muted)]">
              {r.rep_observed_at ? formatDate(r.rep_observed_at) : ''}
            </div>
          </>
        ) : (
          '—'
        )}
      </td>
      <td data-label="Flag">
        <span
          className={`badge ${r.flag === 'MATCH' ? 'status-active' : ''}`}
          title={FLAG_HINT[r.flag] ?? ''}
        >
          {r.flag.replace(/_/g, ' ')}
        </span>
      </td>
    </tr>
  );
}
