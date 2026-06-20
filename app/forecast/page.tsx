'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { TrendingDown, Download } from 'lucide-react';
import Link from 'next/link';
import { api, type ForecastFlag } from '@/lib/api';
import { useActiveRep } from '@/lib/active-rep';
import { useActivePortfolio } from '@/lib/active-portfolio';
import { FreshnessBanner } from '@/components/freshness-banner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/utils';
import { downloadCSV } from '@/lib/export';

const FLAG_CHIP: Record<string, string> = {
  RED: 'change-DELISTED',
  YELLOW: 'change-STATUS_FLIP',
  STALL: 'change-BASELINE',
  NEW: 'change-NEW_LISTING',
  GREEN: 'change-NEW_LISTING',
};

const FLAG_HELP: Record<string, string> = {
  RED: 'stockout now or within a week — get a reorder commitment',
  YELLOW: 'below reorder pace — under 3 weeks of cover, nudge the order',
  STALL: 'stock sitting, nothing selling — needs placement or a tasting',
  NEW: 'too little history to trust the rate yet',
};

export default function ForecastPage() {
  const [portfolio] = useActivePortfolio();
  const [activeRep] = useActiveRep();
  const [sku, setSku] = useState<string | undefined>();
  const [flag, setFlag] = useState<ForecastFlag | undefined>();
  const [mineOnly, setMineOnly] = useState(false);

  const trackedProducts = useQuery({
    queryKey: ['sod-products', true],
    queryFn: () => api.sodProducts(true),
  });
  const fc = useQuery({
    queryKey: ['forecast', portfolio, sku, flag, mineOnly ? activeRep : ''],
    queryFn: () =>
      api.crmForecast({
        portfolio,
        sku,
        flag,
        rep: mineOnly && activeRep ? activeRep : undefined,
      }),
  });

  const tracked = trackedProducts.data?.products ?? trackedProducts.data?.rows ?? [];
  const counts = fc.data?.counts ?? {};

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
          <TrendingDown size={24} className="text-[var(--color-danger)]" />
          Stockout Forecast
        </h1>
        <p className="text-sm text-[var(--color-muted)]">
          4-week moving average of depletions per store/SKU from the daily LCBO
          snapshots. RED = out within ~{fc.data?.red_days ?? 7} days, YELLOW = under{' '}
          {fc.data?.yellow_days ?? 21} days of cover (below reorder pace), STALL = stock
          not moving.
        </p>
      </header>

      <FreshnessBanner />

      {/* Flag summary chips — tap to filter */}
      <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1">
        {(['RED', 'YELLOW', 'STALL', 'NEW'] as const).map((f) => {
          const sel = flag === f;
          return (
            <button
              key={f}
              onClick={() => setFlag(sel ? undefined : f)}
              title={FLAG_HELP[f]}
              className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold min-h-11 ${
                sel
                  ? 'bg-[var(--color-accent)] text-[#2a1f0f]'
                  : 'bg-[var(--color-card)] border border-[var(--color-card-border)]'
              }`}
            >
              <span className={`change-chip ${FLAG_CHIP[f]}`}>{f}</span>
              <span className="tabular-nums">{formatNumber(counts[f] ?? 0)}</span>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="SKU">
            <select
              value={sku ?? ''}
              onChange={(e) => setSku(e.target.value || undefined)}
              className="select"
            >
              <option value="">All tracked SKUs</option>
              {tracked.map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.brand} {p.product_name} ({p.sku})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Stores">
            <button
              onClick={() => setMineOnly(!mineOnly)}
              disabled={!activeRep}
              className={`select text-left ${mineOnly ? 'border-[var(--color-accent)]' : ''}`}
            >
              {mineOnly && activeRep
                ? `Only ${activeRep}'s stores`
                : activeRep
                  ? 'All stores (tap for mine only)'
                  : 'All stores — pick rep on /today'}
            </button>
          </Field>
          <Field label="Window">
            <div className="select flex items-center text-muted">
              {fc.data?.window_days ?? 28} days · anchored {fc.data?.anchor_date ?? '—'}
            </div>
          </Field>
        </CardContent>
      </Card>

      {/* Per-SKU rollup */}
      {fc.data && fc.data.by_sku.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By SKU</CardTitle>
            <CardDescription>
              Network velocity = summed weekly depletion rate across listed stores.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {fc.data.by_sku.map((b) => (
              <Link
                key={b.sku}
                href={`/skus/${b.sku}`}
                className="flex items-center justify-between gap-2 p-2 rounded bg-[var(--color-background)] border border-[var(--color-card-border)] text-xs hover:border-[var(--color-accent)]"
              >
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{b.product_name}</span>
                  <span className="text-muted ml-1.5">{b.stores_listed} stores</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
                  {b.red > 0 && <span className="change-chip change-DELISTED">{b.red} red</span>}
                  {b.yellow > 0 && (
                    <span className="change-chip change-STATUS_FLIP">{b.yellow} yel</span>
                  )}
                  {b.stall > 0 && (
                    <span className="change-chip change-BASELINE">{b.stall} stall</span>
                  )}
                  <span className="text-muted">{b.network_weekly_ma}/wk</span>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{fc.data?.rows.length ?? 0} flagged store-SKUs</CardTitle>
              <CardDescription>RED first, then lowest days of cover.</CardDescription>
            </div>
            {fc.data && fc.data.rows.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => downloadCSV(fc.data!.rows, 'stockout-forecast')}
              >
                <Download size={14} /> CSV
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2.5">
            {fc.isLoading &&
              Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-24" />)}
            {fc.data?.rows.length === 0 && (
              <div className="text-center py-12 text-muted">
                Nothing flagged{flag ? ` as ${flag}` : ''}. Healthy shelves.
              </div>
            )}
            {fc.data?.rows.map((r, i) => (
              <Link
                key={`${r.sku}-${r.store_number}-${i}`}
                href={`/stores/${r.store_number}`}
                className="m-card block"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                      <span className={`change-chip ${FLAG_CHIP[r.flag] ?? 'change-BASELINE'}`}>
                        {r.flag}
                      </span>
                      <span className="text-[11px] text-muted">{r.reason}</span>
                    </div>
                    <div className="font-semibold text-base">
                      #{r.store_number} · {r.account}
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      {r.city} {r.rep ? `· ${r.rep}` : ''}
                    </div>
                    <div className="mt-2 text-sm">
                      {r.product_name}
                      <span className="text-muted font-mono ml-1 text-xs">{r.sku}</span>
                    </div>
                    <div className="text-xs text-muted mt-1 tabular-nums">
                      selling {r.weekly_ma}/wk · {r.depleted_4w} sold in {r.span_days}d
                      {r.restocked_4w > 0 && ` · restocked +${r.restocked_4w}`}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">
                      On-Hand
                    </div>
                    <div
                      className={`text-3xl font-bold mt-0.5 tabular-nums ${
                        r.flag === 'RED'
                          ? 'text-[var(--color-danger)]'
                          : r.flag === 'YELLOW'
                            ? 'text-[var(--color-warning)]'
                            : ''
                      }`}
                    >
                      {formatNumber(r.on_hand)}
                    </div>
                    {r.days_cover != null && (
                      <div className="text-[11px] text-muted mt-0.5">
                        ~{Math.round(r.days_cover)}d cover
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-medium">
        {label}
      </span>
      {children}
    </label>
  );
}
