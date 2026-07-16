'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BrainCircuit, MapPin, Navigation, Phone, Sparkles, Target, TrendingUp,
} from 'lucide-react';
import { api, SalesDayStop } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * AI SALES ENGINE — the pipeline runs itself.
 *  • Hunt: auto-promote the best untouched licensed venues into the pipeline.
 *  • Day plan: territory-wise, geocoded, nearest-neighbour routes that pack
 *    visits into days and cut driving (time + gas). One Maps link per day.
 *  • AI brief: a "why now + how to open" line per stop.
 */

const REGIONS = [
  { v: 'core', label: 'Toronto core' },
  { v: 'gtha', label: 'Wider GTHA' },
  { v: 'all', label: 'All Ontario' },
];

export default function SalesEnginePage() {
  const qc = useQueryClient();
  const [region, setRegion] = useState('core');
  const [rep, setRep] = useState('');
  const [days, setDays] = useState(5);
  const [perDay, setPerDay] = useState(8);

  const pipeline = useQuery({ queryKey: ['sales-pipeline'], queryFn: api.salesPipeline, retry: 1 });
  const plan = useQuery({
    queryKey: ['sales-day-plan', region, rep, days, perDay],
    queryFn: () => api.salesDayPlan({ region, rep: rep || undefined, days, stops_per_day: perDay }),
    retry: 1,
  });

  const hunt = useMutation({
    mutationFn: () => api.salesHunt({ region, limit: 25, rep: rep || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-pipeline'] });
      qc.invalidateQueries({ queryKey: ['sales-day-plan'] });
    },
  });

  const p = pipeline.data;
  const dp = plan.data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
          <BrainCircuit size={24} className="text-[var(--color-accent)]" />
          AI Sales Engine
        </h1>
        <p className="text-sm text-[var(--color-muted)]">
          The pipeline hunts its own leads, packs visits into gas-efficient days, and briefs each call.
        </p>
      </header>

      {/* Pipeline snapshot */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat icon={<Target size={15} />} label="Prospects" value={p?.by_status?.prospect ?? 0} />
        <Stat icon={<TrendingUp size={15} />} label="Warm / tasting" value={(p?.by_status?.warm ?? 0) + (p?.by_status?.tasting ?? 0)} />
        <Stat icon={<Sparkles size={15} />} label="Auto-hunted" value={p?.auto_hunted ?? 0} accent />
        <Stat icon={<MapPin size={15} />} label="Due to visit" value={p?.due_count ?? 0} accent />
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="pt-4 grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-medium">Territory</span>
            <select value={region} onChange={(e) => setRegion(e.target.value)} className="select">
              {REGIONS.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-medium">Rep</span>
            <input value={rep} onChange={(e) => setRep(e.target.value)} placeholder="All / name" className="select" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-medium">Days</span>
            <input type="number" min={1} max={14} value={days} onChange={(e) => setDays(Number(e.target.value))} className="select" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-medium">Stops/day</span>
            <input type="number" min={1} max={20} value={perDay} onChange={(e) => setPerDay(Number(e.target.value))} className="select" />
          </label>
          <button
            onClick={() => hunt.mutate()}
            disabled={hunt.isPending}
            className="h-11 px-4 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Sparkles size={15} className={hunt.isPending ? 'animate-pulse' : ''} />
            {hunt.isPending ? 'Hunting…' : 'Hunt leads'}
          </button>
        </CardContent>
      </Card>

      {hunt.data && (
        <Card><CardContent className="pt-4 text-sm">
          Promoted <strong>{hunt.data.promoted}</strong> new prospects into the pipeline
          (next visit {hunt.data.next_visit}). They now appear in your day plan below.
        </CardContent></Card>
      )}

      {/* Day plan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-2"><Navigation size={16} /> Route plan</span>
            {dp && dp.total_targets > 0 && (
              <span className="text-xs font-normal text-[var(--color-muted)]">
                {dp.planned_stops} stops · {dp.planned_km} km · saves {dp.km_saved} km vs unplanned
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {plan.isLoading && <div className="skeleton h-20" />}
          {dp && dp.total_targets === 0 && (
            <p className="text-sm text-[var(--color-muted)]">
              {dp.note || 'No geocoded targets in this territory yet.'} Try “Hunt leads”, or run the GTHA sweep to place pins.
            </p>
          )}
          {dp?.days.map((d) => (
            <div key={d.day} className="rounded-lg border border-[var(--color-card-border)] overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[var(--color-card-border)]/30">
                <div className="font-semibold text-sm">
                  Day {d.day}
                  <span className="font-normal text-[var(--color-muted)] ml-2">
                    {d.stop_count} stops · {d.drive_km} km · ~{Math.round(d.est_total_min / 60 * 10) / 10}h
                  </span>
                </div>
                <a href={d.directions_url} target="_blank" rel="noreferrer"
                   className="text-xs flex items-center gap-1 h-8 px-3 rounded bg-[var(--color-accent)] text-[#2a1f0f] font-semibold">
                  <Navigation size={12} /> Drive this day
                </a>
              </div>
              <div>
                {d.stops.map((s, i) => <StopRow key={s.account_id} s={s} n={i + 1} />)}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {p && p.due_count > 0 && (
        <Card>
          <CardHeader><CardTitle>Due to visit ({p.due_count})</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {p.due_today.slice(0, 20).map((a) => (
                <Link key={a.account_id} href={`/horeca/${a.account_id}`} className="badge">{a.name}</Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <NextBestCard />
      <CommissionCard rep={rep} />
    </div>
  );
}

function NextBestCard() {
  const [address, setAddress] = useState('');
  const [result, setResult] = useState<import('@/lib/api').NextBestPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function run(params: { lat?: number; lng?: number; address?: string }) {
    setBusy(true); setErr('');
    try {
      setResult(await api.nextBest({ ...params, limit: 8 }));
    } catch (e) {
      setErr('Could not rank calls — check the address or allow location.');
    } finally {
      setBusy(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) { setErr('Location not available on this device.'); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => run({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { setBusy(false); setErr('Location denied — type an address instead.'); },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MapPin size={16} /> Who do I call right here?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <button onClick={useMyLocation} disabled={busy}
                  className="h-11 px-4 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium disabled:opacity-50">
            {busy ? 'Ranking…' : 'Use my location'}
          </button>
          <input value={address} onChange={(e) => setAddress(e.target.value)}
                 placeholder="…or type an address / your home" className="select flex-1" />
          <button onClick={() => address && run({ address })} disabled={busy || !address}
                  className="h-11 px-4 rounded-lg border text-sm font-medium disabled:opacity-50">
            Rank calls
          </button>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        {result?.rows.map((r, i) => (
          <div key={r.account_id} className="flex items-start justify-between gap-2 text-sm border-b last:border-0 pb-2">
            <div className="min-w-0">
              <Link href={`/horeca/${r.account_id}`} className="font-medium underline decoration-dotted underline-offset-2">
                {i + 1}. {r.name}
              </Link>
              <span className="badge ml-1.5">{r.status}</span>
              <div className="text-[11px] text-[var(--color-muted)]">{r.action}</div>
            </div>
            <div className="shrink-0 text-right text-[11px]">
              <div className="tabular-nums">{r.km} km</div>
              <div className="flex gap-2 justify-end mt-0.5">
                {r.phone && <a href={`tel:${r.phone.replace(/[^0-9+]/g, '')}`} className="underline">call</a>}
                <a href={r.google_maps_url} target="_blank" rel="noreferrer" className="underline">map</a>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CommissionCard({ rep }: { rep: string }) {
  const commission = useQuery({
    queryKey: ['commission', rep],
    queryFn: () => api.commission(rep || undefined),
    retry: 1,
  });
  const progs = commission.data?.programs ?? [];
  if (progs.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Target size={16} /> Bonus tracker</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {progs.map((pr) => {
          const denom = pr.units_total + pr.stock_pool_units;
          const pct = denom > 0 ? Math.round((pr.units_total / denom) * 100) : 0;
          return (
            <div key={pr.program_id}>
              <div className="flex justify-between text-sm">
                <span className="font-medium">{pr.sku_name || pr.sku} · ${pr.per_unit_bonus}/bottle
                  <span className="text-[var(--color-muted)] font-normal"> · {pr.rep}</span>
                </span>
                <span className="font-semibold text-[var(--color-accent)] tabular-nums">
                  ${pr.earned.toFixed(2)} earned
                </span>
              </div>
              <div className="h-2 rounded-full bg-[var(--color-card-border)] overflow-hidden mt-1.5">
                <div className="h-full bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-[11px] text-[var(--color-muted)] mt-1">
                {pr.units_total} bottles credited ({pr.units_from_orders} HORECA + {pr.units_from_tastings} tastings)
                · {pr.stock_pool_units} still in market worth ${pr.pool_value.toFixed(0)} more
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--color-card-border)] p-2.5">
      <div className={`text-lg font-semibold tabular-nums flex items-center gap-1.5 ${accent ? 'text-[var(--color-accent)]' : ''}`}>
        {icon}{value}
      </div>
      <div className="text-[11px] text-[var(--color-muted)] mt-0.5">{label}</div>
    </div>
  );
}

function StopRow({ s, n }: { s: SalesDayStop; n: number }) {
  const [brief, setBrief] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function getBrief() {
    setLoading(true);
    try {
      const b = await api.salesBrief(s.account_id);
      setBrief(b.brief);
    } catch {
      setBrief('Could not load a brief right now.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="px-3 py-2 border-b border-[var(--color-card-border)] last:border-0 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/horeca/${s.account_id}`} className="font-medium underline decoration-dotted underline-offset-2">
            {n}. {s.name}
          </Link>
          <div className="text-[11px] text-[var(--color-muted)]">
            {[s.address, s.city].filter(Boolean).join(', ')} · {s.lead_sku}
          </div>
        </div>
        <div className="shrink-0 text-right text-[11px] text-[var(--color-muted)]">
          {s.leg_km} km · {s.drive_min}m
          <div className="flex gap-2 justify-end mt-1">
            {s.phone && <a href={`tel:${s.phone.replace(/[^0-9+]/g, '')}`} className="underline flex items-center gap-0.5"><Phone size={10} />call</a>}
            <a href={s.maps_url} target="_blank" rel="noreferrer" className="underline">map</a>
            <button onClick={getBrief} className="underline flex items-center gap-0.5"><Sparkles size={10} />brief</button>
          </div>
        </div>
      </div>
      {loading && <div className="text-[11px] text-[var(--color-muted)] mt-1.5">Thinking…</div>}
      {brief && <div className="text-xs mt-1.5 p-2 rounded bg-[var(--color-card-border)]/30">{brief}</div>}
    </div>
  );
}
