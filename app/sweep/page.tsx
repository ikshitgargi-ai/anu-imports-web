'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPinned, Phone, Play, Radar, ShieldCheck, Store } from 'lucide-react';
import { api, VenueRow } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * GTHA SWEEP — scan every street of the Greater Toronto + Hamilton Area on
 * OpenStreetMap for food/drink venues, then cross-reference to the AGCO
 * licensee universe (licensed = a real target) and enrich with contact info.
 * Free + legal (OSM ODbL, Toronto Open Government Licence). Google Maps / Yelp
 * are one-tap lookups per venue — their terms forbid storing their data.
 */

export default function SweepPage() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [runLog, setRunLog] = useState<string[]>([]);

  const status = useQuery({
    queryKey: ['sweep-status'],
    queryFn: api.sweepStatus,
    refetchInterval: running ? 4000 : false,
    retry: 1,
  });

  const plan = useMutation({ mutationFn: api.sweepPlan });
  const enrich = useMutation({ mutationFn: api.sweepEnrich });
  const enrichPhones = useMutation({ mutationFn: api.sweepEnrichTorontoPhones });

  // Drive the resumable sweep from the browser: plan once, then drain tiles in
  // batches until none remain. Each call is short (dodges the proxy timeout).
  async function runFullSweep() {
    setRunning(true);
    setRunLog(['Planning the GTHA tile grid…']);
    try {
      await api.sweepPlan();
      let guard = 0;
      // eslint-disable-next-line no-constant-condition
      while (guard++ < 200) {
        const r = await api.sweepRun(6);
        setRunLog((l) => [
          `Swept ${r.tiles_swept_this_run} tiles · ${r.venues_total} venues found · ${r.pending} tiles left`,
          ...l,
        ].slice(0, 12));
        qc.invalidateQueries({ queryKey: ['sweep-status'] });
        if (r.pending <= 0) break;
      }
      setRunLog((l) => ['Sweep complete. Cross-referencing to AGCO…', ...l]);
      const e = await api.sweepEnrich();
      setRunLog((l) => [
        `Enriched ${e.licensees_enriched} licensees, matched ${e.licensees_matched} mapped venues to a licence.`,
        ...l,
      ]);
      const p = await api.sweepEnrichTorontoPhones();
      setRunLog((l) => [
        `Toronto phones: added ${p.licensees_phone_enriched} phone numbers to licence records.`,
        ...l,
      ]);
    } catch (err) {
      setRunLog((l) => [`Paused: ${(err as Error).message}. Press Run to resume.`, ...l]);
    } finally {
      setRunning(false);
      qc.invalidateQueries({ queryKey: ['sweep-status'] });
    }
  }

  const s = status.data;
  const pct = s && s.tiles_total ? Math.round((s.tiles_done / s.tiles_total) * 100) : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <Radar size={24} className="text-[var(--color-accent)]" />
            GTHA Street Sweep
          </h1>
          <p className="text-sm text-[var(--color-muted)]">
            Scan every street of the Greater Toronto + Hamilton Area on OpenStreetMap,
            cross-reference the AGCO licence universe, enrich with phones. Free and legal.
          </p>
        </div>
        <Link href="/horeca/prospects" className="text-sm underline shrink-0">
          → Licensee universe
        </Link>
      </header>

      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat icon={<MapPinned size={15} />} label="Tiles swept" value={`${s?.tiles_done ?? 0}/${s?.tiles_total ?? '—'}`} />
            <Stat icon={<Store size={15} />} label="Venues mapped" value={s?.venues_total ?? 0} />
            <Stat icon={<ShieldCheck size={15} />} label="Licensed matches" value={s?.venues_matched_to_licence ?? 0} accent />
            <Stat icon={<Phone size={15} />} label="Licensees enriched" value={s?.licensees_enriched ?? 0} accent />
          </div>

          <div>
            <div className="h-2 rounded-full bg-[var(--color-card-border)] overflow-hidden">
              <div className="h-full bg-[var(--color-accent)] transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-xs text-[var(--color-muted)] mt-1">{pct}% of the GTHA grid swept</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={runFullSweep}
              disabled={running}
              className="flex items-center gap-2 h-11 px-4 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-fg)] text-sm font-medium disabled:opacity-50"
            >
              <Play size={15} className={running ? 'animate-pulse' : ''} />
              {running ? 'Sweeping…' : (s?.tiles_done ? 'Resume / re-run sweep' : 'Run the GTHA sweep')}
            </button>
            <button
              onClick={() => enrich.mutate(undefined, { onSuccess: () => qc.invalidateQueries({ queryKey: ['sweep-status'] }) })}
              disabled={enrich.isPending}
              className="h-11 px-4 rounded-lg border text-sm font-medium disabled:opacity-50"
            >
              {enrich.isPending ? 'Matching…' : 'Cross-reference AGCO'}
            </button>
            <button
              onClick={() => enrichPhones.mutate()}
              disabled={enrichPhones.isPending}
              className="h-11 px-4 rounded-lg border text-sm font-medium disabled:opacity-50"
            >
              {enrichPhones.isPending ? 'Loading phones…' : 'Add Toronto phones'}
            </button>
          </div>

          {runLog.length > 0 && (
            <div className="text-xs font-mono text-[var(--color-muted)] space-y-1 border-t border-[var(--color-card-border)] pt-3">
              {runLog.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}

          <p className="text-[11px] text-[var(--color-muted)] leading-relaxed border-t border-[var(--color-card-border)] pt-3">
            Sources: OpenStreetMap (ODbL), AGCO Liquor Sales Licences and City of Toronto
            open data (Open Government Licence). Google Maps and Yelp appear as per-venue
            lookup links only — storing their data in a CRM is against their terms, and the
            licensed venues here are the ones that can actually buy the portfolio.
          </p>
        </CardContent>
      </Card>

      <VenuesBrowser />
    </div>
  );
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--color-card-border)] p-2.5">
      <div className={`text-lg font-semibold tabular-nums flex items-center gap-1.5 ${accent ? 'text-[var(--color-accent)]' : ''}`}>
        {icon}{value}
      </div>
      <div className="text-[11px] text-[var(--color-muted)] mt-0.5">{label}</div>
    </div>
  );
}

function VenuesBrowser() {
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [licensed, setLicensed] = useState(false); // show EVERY venue by default
  const [hasPhone, setHasPhone] = useState(false);
  const [offset, setOffset] = useState(0);

  const venues = useQuery({
    queryKey: ['venues', q, city, licensed, hasPhone, offset],
    queryFn: () => api.venues({ q: q || undefined, city: city || undefined, licensed, has_phone: hasPhone, limit: 50, offset }),
    retry: 1,
  });

  const total = venues.data?.count ?? 0;

  return (
    <Card>
      <CardHeader><CardTitle>Mapped venues {total > 0 && <span className="text-xs font-normal text-[var(--color-muted)]">({total.toLocaleString()})</span>}</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <input value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder="Name…" className="select col-span-2" />
          <input value={city} onChange={(e) => { setCity(e.target.value); setOffset(0); }} placeholder="City" className="select" />
          <div className="flex flex-col gap-1 justify-center text-xs">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={licensed} onChange={(e) => { setLicensed(e.target.checked); setOffset(0); }} /> Licensed only</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={hasPhone} onChange={(e) => { setHasPhone(e.target.checked); setOffset(0); }} /> Has phone</label>
          </div>
        </div>
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="data-table table-to-cards min-w-[820px] sm:min-w-0">
            <thead><tr><th>Venue</th><th>Kind</th><th>City</th><th>Phone</th><th>Look up</th></tr></thead>
            <tbody>
              {venues.data?.rows.map((r) => <VRow key={r.osm_id} r={r} />)}
              {venues.data && venues.data.rows.length === 0 && (
                <tr><td colSpan={5} className="text-center py-6 text-[var(--color-muted)] text-sm">Run the sweep to populate venues.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {total > 50 && (
          <div className="flex justify-between pt-3">
            <button onClick={() => setOffset(Math.max(0, offset - 50))} disabled={offset === 0} className="text-sm underline disabled:opacity-40">← Prev</button>
            <button onClick={() => setOffset(offset + 50)} disabled={offset + 50 >= total} className="text-sm underline disabled:opacity-40">Next →</button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VRow({ r }: { r: VenueRow }) {
  return (
    <tr>
      <td data-label="Venue" className="font-medium">
        {r.name}
        {r.licensed && <span className="badge status-active ml-1.5">licensed</span>}
        <div className="text-[11px] font-normal text-[var(--color-muted)]">
          {[r.address, r.postal].filter(Boolean).join(', ') || (
            <a href={r.google_maps_url} target="_blank" rel="noreferrer" className="underline">address on map →</a>
          )}
        </div>
      </td>
      <td data-label="Kind" className="capitalize">{r.kind}</td>
      <td data-label="City">{r.city}</td>
      <td data-label="Phone" className="text-xs">
        {r.phone ? <a href={`tel:${r.phone.replace(/[^0-9+]/g, '')}`} className="underline">{r.phone}</a> : '—'}
      </td>
      <td data-label="Look up" className="text-xs">
        <div className="flex gap-2">
          <a href={r.google_maps_url} target="_blank" rel="noreferrer" className="underline">Maps</a>
          <a href={r.yelp_url} target="_blank" rel="noreferrer" className="underline">Yelp</a>
          {r.website && <a href={r.website} target="_blank" rel="noreferrer" className="underline">Site</a>}
        </div>
      </td>
    </tr>
  );
}
