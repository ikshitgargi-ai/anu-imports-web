'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, MapPin, RefreshCw, Star } from 'lucide-react';
import { api, HorecaProspectRow } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const PAGE = 50;

export default function HorecaProspectsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [kind, setKind] = useState('');
  const [independent, setIndependent] = useState(true);
  const [unmatched, setUnmatched] = useState(true);
  const [offset, setOffset] = useState(0);

  const prospects = useQuery({
    queryKey: ['horeca-prospects', q, city, region, kind, independent, unmatched, offset],
    queryFn: () =>
      api.horecaProspects({
        q: q || undefined,
        city: city || undefined,
        region: region || undefined,
        kind: kind || undefined,
        independent,
        unmatched,
        limit: PAGE,
        offset,
      }),
  });

  const sync = useMutation({
    mutationFn: api.horecaAgcoSync,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['horeca-prospects'] }),
  });

  const addToBook = useMutation({
    mutationFn: (row: HorecaProspectRow) =>
      api.horecaCreate({
        name: row.name,
        account_type: row.kind === 'other' ? 'restaurant' : row.kind,
        address: row.address,
        city: row.city,
        postal: row.postal,
        status: 'prospect',
        priority: row.is_independent ? 'P2' : 'P3',
        notes: `AGCO licence ${row.licence_number} (${row.status}). Source: AGCO open data.`,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['horeca-prospects'] }),
  });

  const total = prospects.data?.count ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <Landmark size={24} className="text-[var(--color-accent)]" />
            Licensee Universe
          </h1>
          <p className="text-sm text-[var(--color-muted)]">
            Every active AGCO liquor sales licensee: anyone legally able to buy our
            portfolio through the LCBO on their licence. Independents first.
          </p>
        </div>
        <button
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="flex items-center gap-2 h-11 px-4 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-fg)] text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw size={16} className={sync.isPending ? 'animate-spin' : ''} />
          {sync.isPending ? 'Syncing AGCO…' : 'Sync AGCO data'}
        </button>
      </header>

      {sync.data && (
        <Card>
          <CardContent className="pt-4 text-sm">
            Synced {sync.data.total_active.toLocaleString()} active licences:{' '}
            {sync.data.by_region.core?.toLocaleString()} Toronto core,{' '}
            {sync.data.by_region.gtha?.toLocaleString()} wider GTHA,{' '}
            {sync.data.independents.toLocaleString()} independents,{' '}
            {sync.data.matched_to_book} matched to our book.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4 grid grid-cols-2 sm:grid-cols-6 gap-3">
          <label className="flex flex-col gap-1.5 col-span-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-medium">Search</span>
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setOffset(0); }}
              placeholder="Venue name…"
              className="select"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-medium">City</span>
            <input
              value={city}
              onChange={(e) => { setCity(e.target.value); setOffset(0); }}
              placeholder="e.g. Toronto"
              className="select"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-medium">Region</span>
            <select value={region} onChange={(e) => { setRegion(e.target.value); setOffset(0); }} className="select">
              <option value="">All Ontario</option>
              <option value="core">Toronto core</option>
              <option value="gtha">Wider GTHA</option>
              <option value="other">Beyond GTHA</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-medium">Kind</span>
            <select value={kind} onChange={(e) => { setKind(e.target.value); setOffset(0); }} className="select">
              <option value="">Any</option>
              <option value="bar">Bar / pub</option>
              <option value="club">Club / lounge</option>
              <option value="hotel">Hotel</option>
              <option value="restaurant">Restaurant</option>
              <option value="banquet">Banquet / events</option>
              <option value="other">Other</option>
            </select>
          </label>
          <div className="flex flex-col gap-2 justify-end pb-1">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={independent} onChange={(e) => { setIndependent(e.target.checked); setOffset(0); }} />
              Independents only
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={unmatched} onChange={(e) => { setUnmatched(e.target.checked); setOffset(0); }} />
              Not in our book yet
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {total.toLocaleString()} licensed targets
            {total > PAGE && (
              <span className="text-xs font-normal text-[var(--color-muted)] ml-2">
                showing {offset + 1}–{Math.min(offset + PAGE, total)}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {prospects.isLoading && <div className="py-8 text-center text-sm text-[var(--color-muted)]">Loading…</div>}
          {prospects.data && prospects.data.rows.length === 0 && (
            <div className="py-8 text-center text-sm text-[var(--color-muted)]">
              No rows. Run “Sync AGCO data” once to load the universe.
            </div>
          )}
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="data-table table-to-cards min-w-[980px] sm:min-w-0">
              <thead>
                <tr>
                  <th>Venue</th>
                  <th>Kind</th>
                  <th>City</th>
                  <th>Licence</th>
                  <th>Profile</th>
                  <th>Look up</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {prospects.data?.rows.map((r) => (
                  <tr key={r.licence_number}>
                    <td data-label="Venue" className="font-medium">
                      {r.name}
                      <div className="text-[11px] font-normal text-[var(--color-muted)]">{r.address}</div>
                    </td>
                    <td data-label="Kind" className="capitalize">{r.kind}</td>
                    <td data-label="City">{r.city}</td>
                    <td data-label="Licence" className="text-xs">
                      {r.licence_number}
                      <div className="text-[var(--color-muted)]">{r.status}</div>
                    </td>
                    <td data-label="Profile">
                      {r.is_independent ? (
                        <span className="badge status-active flex items-center gap-1 w-fit"><Star size={11} /> Independent</span>
                      ) : (
                        <span className="badge">{r.locations} locations</span>
                      )}
                    </td>
                    <td data-label="Look up" className="text-xs">
                      <div className="flex gap-2">
                        <a href={r.google_maps_url} target="_blank" rel="noreferrer" className="underline flex items-center gap-1">
                          <MapPin size={12} /> Maps
                        </a>
                        <a href={r.yelp_url} target="_blank" rel="noreferrer" className="underline">Yelp</a>
                      </div>
                    </td>
                    <td data-label="">
                      {r.matched_account_id ? (
                        <Link href={`/horeca/${r.matched_account_id}`} className="text-xs underline">In book →</Link>
                      ) : (
                        <button
                          onClick={() => addToBook.mutate(r)}
                          disabled={addToBook.isPending}
                          className="text-xs h-8 px-3 rounded bg-[var(--color-primary)] text-[var(--color-primary-fg)] disabled:opacity-50"
                        >
                          Add to book
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > PAGE && (
            <div className="flex items-center justify-between pt-3">
              <button
                onClick={() => setOffset(Math.max(0, offset - PAGE))}
                disabled={offset === 0}
                className="text-sm underline disabled:opacity-40"
              >
                ← Previous
              </button>
              <button
                onClick={() => setOffset(offset + PAGE)}
                disabled={offset + PAGE >= total}
                className="text-sm underline disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
