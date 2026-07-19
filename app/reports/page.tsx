'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Activity, GitCompare, TrendingUp, TrendingDown } from 'lucide-react';
import { api, type ReportPayload } from '@/lib/api';
import { FreshnessBanner } from '@/components/freshness-banner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn, formatDate, formatNumber } from '@/lib/utils';

const METRIC_LABELS: Record<string, string> = {
  tastings_done: 'RPR tastings',
  shelf_photos: 'Shelf photos',
  new_horeca_accounts: 'New HORECA',
  field_activities: 'Field activities',
  displays_secured: 'Displays secured',
  skus_tracked: 'SKUs tracked',
  total_stores: 'Stores',
  total_on_hand: 'Total on-hand',
  active_stores: 'Active stores',
};
const ml = (k: string) => METRIC_LABELS[k] ?? k.replace(/_/g, ' ');

type RangeKey = 'daily' | 'weekly' | 'monthly';

export default function ReportsPage() {
  const [range, setRange] = useState<RangeKey>('daily');

  const report = useQuery<ReportPayload>({
    queryKey: ['report', range],
    queryFn: () =>
      range === 'daily'
        ? api.reportDaily()
        : range === 'weekly'
          ? api.reportWeekly()
          : api.reportMonthly(),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
          <Activity size={24} className="text-[var(--color-accent)]" />
          Reports
        </h1>
        <p className="text-sm text-[var(--color-muted)]">
          Daily snapshot · weekly Mon-Sun · monthly.
        </p>
      </header>

      <FreshnessBanner />

      <div className="flex gap-2 overflow-x-auto">
        {(['daily', 'weekly', 'monthly'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={cn(
              'h-11 px-4 rounded-lg text-sm font-medium transition-colors',
              range === r
                ? 'bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
                : 'bg-[var(--color-card)] border border-[var(--color-card-border)] text-[var(--color-foreground)]',
            )}
          >
            {r[0].toUpperCase() + r.slice(1)}
          </button>
        ))}
      </div>

      {report.data?.window.window_shifted && (
        <div className="rounded-lg border border-[rgba(253,203,110,0.3)] bg-[rgba(253,203,110,0.08)] p-3 text-sm text-[#ffd780]">
          <b>Window shifted.</b> You requested {formatDate(report.data.window.requested_window.start)} →{' '}
          {formatDate(report.data.window.requested_window.end)}, but no data in that range. Showing{' '}
          {formatDate(report.data.window.start)} → {formatDate(report.data.window.end)} instead.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Window start" value={report.data ? formatDate(report.data.window.start) : '—'} />
        <Stat label="Window end" value={report.data ? formatDate(report.data.window.end) : '—'} />
        <Stat
          label="Products tracked"
          value={formatNumber(report.data?.totals.products_tracked)}
        />
        <Stat
          label="Changes in window"
          value={formatNumber(report.data?.totals.changes_in_window)}
        />
      </div>

      <CompareSection />

      <Card>
        <CardHeader>
          <CardTitle>Per-SKU snapshot</CardTitle>
          <CardDescription>Latest snapshot in window.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="data-table table-to-cards min-w-[800px] sm:min-w-0">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Product</th>
                  <th className="text-right">Listed</th>
                  <th className="text-right">Delisting</th>
                  <th className="text-right">Fully Delisted</th>
                  <th className="text-right">Total On-Hand</th>
                </tr>
              </thead>
              <tbody>
                {report.data?.snapshot_metrics.map((m, i) => (
                  <tr key={i}>
                    <td data-label="Brand">{m.brand}</td>
                    <td data-label="Product">{m.product_name}</td>
                    <td data-label="Listed" className="text-right tabular-nums">
                      {m.listed_stores}
                    </td>
                    <td data-label="Delisting" className="text-right tabular-nums">
                      {m.delisting_stores}
                    </td>
                    <td data-label="Fully Delisted" className="text-right tabular-nums">
                      {m.fully_delisted_stores}
                    </td>
                    <td data-label="On-Hand" className="text-right tabular-nums">
                      {formatNumber(m.total_on_hand)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listing changes in window</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-4 sm:mx-0 max-h-96">
            <table className="data-table min-w-[500px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Product</th>
                  <th>Old → New</th>
                </tr>
              </thead>
              <tbody>
                {report.data?.listing_changes.map((c, i) => (
                  <tr key={i}>
                    <td className="text-xs">{formatDate(c.change_date)}</td>
                    <td>
                      <span className="badge">{c.change_type}</span>
                    </td>
                    <td>
                      {c.brand} {c.product_name}
                    </td>
                    <td className="text-xs">
                      {c.old_status ?? '—'} → {c.new_status ?? '—'}
                    </td>
                  </tr>
                ))}
                {report.data?.listing_changes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-6 text-[var(--color-muted)]">
                      No changes in this window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
          {label}
        </div>
        <div className="text-xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

/** Saved report snapshots + past-vs-future compare. Snapshots are written
 *  automatically every time a Weekly/Monthly report is viewed. */
function CompareSection() {
  const [kind, setKind] = useState<'weekly' | 'monthly'>('weekly');
  const [a, setA] = useState('');
  const [b, setB] = useState('');

  const saved = useQuery({
    queryKey: ['reports-saved', kind],
    queryFn: () => api.reportsSaved(kind, 52),
  });
  const compare = useQuery({
    queryKey: ['reports-compare', a, b],
    queryFn: () => api.reportsCompare(a, b),
    enabled: Boolean(a && b && a !== b),
  });

  const rows = saved.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitCompare size={18} className="text-[var(--color-accent)]" />
          Compare periods
        </CardTitle>
        <CardDescription>
          Every weekly/monthly report you open is saved. Pick two to see what moved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-1.5">
          {(['weekly', 'monthly'] as const).map((k) => (
            <button
              key={k}
              onClick={() => {
                setKind(k);
                setA('');
                setB('');
              }}
              className={cn(
                'change-chip min-h-9 px-3',
                kind === k
                  ? 'bg-[var(--color-accent)] text-[var(--color-primary-fg)]'
                  : 'bg-[var(--color-card)] border border-[var(--color-card-border)]',
              )}
            >
              {k}
            </button>
          ))}
        </div>

        {rows.length < 2 ? (
          <div className="text-sm text-muted py-2">
            Open at least two different {kind} reports (use the tabs above, change the period) to
            build up snapshots to compare.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-muted font-medium">
                  Period A (earlier)
                </span>
                <select value={a} onChange={(e) => setA(e.target.value)} className="select">
                  <option value="">— pick —</option>
                  {rows.map((s) => (
                    <option key={s.id} value={s.period_start}>
                      {s.period_start} → {s.period_end}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-muted font-medium">
                  Period B (later)
                </span>
                <select value={b} onChange={(e) => setB(e.target.value)} className="select">
                  <option value="">— pick —</option>
                  {rows.map((s) => (
                    <option key={s.id} value={s.period_start}>
                      {s.period_start} → {s.period_end}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {compare.data && (
              <div className="space-y-1.5">
                {Object.entries(compare.data.deltas).map(([k, d]) => {
                  const up = d.abs_change > 0;
                  const down = d.abs_change < 0;
                  return (
                    <div
                      key={k}
                      className="flex items-center justify-between gap-2 p-2 rounded bg-[var(--color-background)] border border-[var(--color-card-border)] text-sm"
                    >
                      <span className="capitalize">{ml(k)}</span>
                      <div className="flex items-center gap-2 tabular-nums">
                        <span className="text-muted">{formatNumber(d.a)}</span>
                        <span className="text-muted">→</span>
                        <span className="font-semibold">{formatNumber(d.b)}</span>
                        <span
                          className={cn(
                            'inline-flex items-center gap-0.5 w-16 justify-end font-semibold',
                            up && 'text-[var(--color-success)]',
                            down && 'text-[var(--color-danger)]',
                            !up && !down && 'text-muted',
                          )}
                        >
                          {up && <TrendingUp size={13} />}
                          {down && <TrendingDown size={13} />}
                          {d.pct_change == null ? '—' : `${d.pct_change > 0 ? '+' : ''}${d.pct_change}%`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
