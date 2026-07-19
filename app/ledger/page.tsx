'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, ScrollText, Search, ShieldCheck } from 'lucide-react';
import { api, CanonListingRow } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';

/**
 * CANONICAL LISTINGS — the immutable, source-independent ledger.
 *
 * Every listing is recorded forever from three independent witnesses (SOD
 * daily feed, lcbo.com live checks, rep shelf observations) and survives even
 * a total SOD loss. This page reads the materialized fold of that ledger.
 */

export default function LedgerPage() {
  const [q, setQ] = useState('');
  const [sku, setSku] = useState('');

  const listings = useQuery({ queryKey: ['canon-listings'], queryFn: api.canonListings, retry: 1 });

  const rows = useMemo(() => {
    let all = listings.data?.rows ?? [];
    if (sku) all = all.filter((r) => r.sku === sku);
    if (q.trim()) {
      const n = q.trim().toLowerCase();
      all = all.filter(
        (r) =>
          String(r.store_number).includes(n) ||
          (r.account || '').toLowerCase().includes(n) ||
          (r.city || '').toLowerCase().includes(n),
      );
    }
    return all;
  }, [listings.data, q, sku]);

  const skus = useMemo(() => {
    const s = new Map<string, string>();
    for (const r of listings.data?.rows ?? []) s.set(r.sku, r.product_name);
    return Array.from(s.entries()).sort();
  }, [listings.data]);

  const listed = rows.filter((r) => r.status === 'LISTED').length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <ScrollText size={24} className="text-[var(--color-accent)]" />
            Listings (canonical ledger)
          </h1>
          <p className="text-sm text-[var(--color-muted)] flex items-center gap-1.5">
            <ShieldCheck size={14} />
            Immutable record, cross-verified by SOD + lcbo.com + rep shelf checks.
            Survives SOD loss.
          </p>
        </div>
        <a
          href={api.exportCanonListingsXlsxUrl()}
          className="shrink-0 flex items-center gap-2 h-11 px-4 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-fg)] text-sm font-medium"
        >
          <Download size={15} /> Excel
        </a>
      </header>

      <Card>
        <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-medium">Search</span>
            <div className="flex items-center gap-2">
              <Search size={14} className="text-[var(--color-muted)] shrink-0" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Store #, name, city…"
                className="select w-full"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-medium">SKU</span>
            <select value={sku} onChange={(e) => setSku(e.target.value)} className="select">
              <option value="">All 9 SKUs</option>
              {skus.map(([s, name]) => (
                <option key={s} value={s}>{name}</option>
              ))}
            </select>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {rows.length} rows · {listed} listed
          </CardTitle>
        </CardHeader>
        <CardContent>
          {listings.isLoading && <div className="py-8 text-center text-sm text-[var(--color-muted)]">Loading ledger…</div>}
          {listings.isError && (
            <div className="py-8 text-center text-sm text-[var(--color-muted)]">
              Ledger endpoint not reachable yet (deploy in progress?). Retry shortly.
            </div>
          )}
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="data-table table-to-cards min-w-[880px] sm:min-w-0">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Store</th>
                  <th>Status</th>
                  <th>First listed</th>
                  <th>Last confirmed</th>
                  <th>Witnessed by</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Row key={`${r.sku}-${r.store_number}`} r={r} />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ r }: { r: CanonListingRow }) {
  const sources = (r.sources_seen || '').split(',').filter(Boolean);
  return (
    <tr>
      <td data-label="Product" className="font-medium">
        {r.product_name}
        <div className="text-[11px] font-normal text-[var(--color-muted)]">#{r.sku}</div>
      </td>
      <td data-label="Store">
        #{r.store_number}
        <div className="text-[11px] text-[var(--color-muted)]">
          {[r.account, (r as { address?: string }).address, r.city].filter(Boolean).join(' · ')}
        </div>
      </td>
      <td data-label="Status">
        <span className={`badge ${r.status === 'LISTED' ? 'status-active' : ''}`}>{r.status}</span>
      </td>
      <td data-label="First listed" className="text-xs">{r.first_listed_date ? formatDate(r.first_listed_date) : '—'}</td>
      <td data-label="Last confirmed" className="text-xs">
        {r.last_confirmed_date ? formatDate(r.last_confirmed_date) : '—'}
        {r.days_since_confirmed != null && r.days_since_confirmed > 7 && (
          <span className="badge ml-1">{r.days_since_confirmed}d ago</span>
        )}
      </td>
      <td data-label="Witnessed by">
        <div className="flex gap-1 flex-wrap">
          {sources.map((s) => (
            <span key={s} className="badge">{s === 'live' ? 'lcbo.com' : s}</span>
          ))}
        </div>
      </td>
    </tr>
  );
}
