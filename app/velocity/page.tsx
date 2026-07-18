'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Gauge } from 'lucide-react';
import { api, VelocityRow } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TRACKED_SKUS } from '@/lib/skus';

/**
 * VELOCITY — cross-SKU sell-through per store from SOD on-hand history.
 * Fast shelves running dry vs slow shelves sitting heavy, and the rebalance
 * play that moves bottles between them: tastings at the heavy shelves,
 * restock evidence for the buyer on the dry ones.
 */

const CLASS_STYLE: Record<string, string> = {
  fast: 'badge-listed',
  steady: 'badge-neutral',
  slow: 'badge-delisting',
  stagnant: 'badge-delisted',
  out: 'badge-delisted',
};

const CLASS_HINT: Record<string, string> = {
  fast: '21 days of cover or less: restock risk',
  steady: 'healthy movement',
  slow: 'over 60 days of cover',
  stagnant: 'stock on shelf, zero movement in the window',
  out: 'empty shelf, nothing moving: restock or delist question',
};

export default function VelocityPage() {
  const [days, setDays] = useState(28);
  const [sku, setSku] = useState('');
  const [klass, setKlass] = useState('');

  const vel = useQuery({
    queryKey: ['velocity', days, sku],
    queryFn: () => api.salesVelocity(days, sku || undefined),
    retry: 1,
  });
  const reb = useQuery({
    queryKey: ['rebalance', sku],
    queryFn: () => api.rebalance(sku),
    enabled: !!sku,
    retry: 1,
  });

  const rows = (vel.data?.rows ?? []).filter((r) => !klass || r.class === klass);
  const byClass = vel.data?.by_class ?? {};

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
          <Gauge size={24} className="text-[var(--color-accent)]" />
          Velocity
        </h1>
        <p className="text-sm text-[var(--color-muted)]">
          Sell-through per store per SKU from the SOD history. Restocks never
          count as negative sales.
        </p>
      </header>

      <Card>
        <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-medium">SKU</span>
            <select value={sku} onChange={(e) => setSku(e.target.value)} className="select">
              <option value="">All 9 SKUs</option>
              {TRACKED_SKUS.map((s) => (
                <option key={s.sku} value={s.sku}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-medium">Window</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="select">
              <option value={14}>14 days</option>
              <option value={28}>28 days</option>
              <option value={56}>56 days</option>
              <option value={90}>90 days</option>
            </select>
          </label>
          <div className="flex items-end flex-wrap gap-2">
            {Object.entries(byClass).map(([c, n]) => (
              <button
                key={c}
                onClick={() => setKlass(c === klass ? '' : c)}
                className={`badge ${klass === c ? 'status-active' : ''}`}
                title={CLASS_HINT[c] ?? ''}
              >
                {c} ({n})
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {sku && reb.data && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowLeftRight size={16} /> Rebalance: {reb.data.product_name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">{reb.data.play}</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium mb-2">Sitting heavy (tasting targets)</p>
                {reb.data.slow_heavy.map((r) => (
                  <MiniRow key={r.store_number} r={r} right={`${r.on_hand} btl sitting`} />
                ))}
                {reb.data.slow_heavy.length === 0 && <p className="text-[var(--color-muted)]">None. Every shelf is moving.</p>}
              </div>
              <div>
                <p className="font-medium mb-2">Running dry (restock asks for the buyer)</p>
                {reb.data.fast_low.map((r) => (
                  <MiniRow key={r.store_number} r={r} right={`${r.on_hand} left · ${r.rate_per_week}/wk`} />
                ))}
                {reb.data.fast_low.length === 0 && <p className="text-[var(--color-muted)]">No fast shelf is near empty.</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{rows.length} store-SKU rows · last {vel.data?.days ?? days} days</CardTitle>
        </CardHeader>
        <CardContent>
          {vel.isLoading && <div className="py-8 text-center text-sm text-[var(--color-muted)]">Computing velocity…</div>}
          {vel.isError && (
            <div className="py-8 text-center text-sm text-[var(--color-muted)]">
              Velocity endpoint busy or deploying. Retry shortly.
            </div>
          )}
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="data-table table-to-cards min-w-[880px] sm:min-w-0">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Store</th>
                  <th>On hand</th>
                  <th>Sold (est)</th>
                  <th>Rate/wk</th>
                  <th>Cover</th>
                  <th>Class</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.sku}-${r.store_number}`}>
                    <td data-label="Product" className="font-medium">
                      {r.product_name}
                      <div className="text-[11px] font-normal text-[var(--color-muted)]">#{r.sku}</div>
                    </td>
                    <td data-label="Store">
                      #{r.store_number}
                      <div className="text-[11px] text-[var(--color-muted)]">{r.store_label}</div>
                    </td>
                    <td data-label="On hand" className="tabular-nums">{r.on_hand}</td>
                    <td data-label="Sold (est)" className="tabular-nums font-medium">{r.sold_est}</td>
                    <td data-label="Rate/wk" className="tabular-nums">{r.rate_per_week}</td>
                    <td data-label="Cover" className="tabular-nums">{r.days_of_cover != null ? `${r.days_of_cover}d` : '—'}</td>
                    <td data-label="Class">
                      <span className={`badge ${CLASS_STYLE[r.class] ?? ''}`} title={CLASS_HINT[r.class] ?? ''}>
                        {r.class}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MiniRow({ r, right }: { r: VelocityRow; right: string }) {
  return (
    <div className="flex justify-between gap-2 border-b last:border-0 py-1.5">
      <span>
        #{r.store_number}
        <span className="text-[var(--color-muted)]"> · {r.store_label}</span>
      </span>
      <span className="tabular-nums shrink-0">{right}</span>
    </div>
  );
}
