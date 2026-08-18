'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Navigation, MapPin, LocateFixed, Fuel, Clock, Store, Wine, Loader2 } from 'lucide-react';
import { api, type DayRoutePayload } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const RouteMap = dynamic(() => import('@/components/route-map'), {
  ssr: false,
  loading: () => <div className="w-full h-[380px] rounded-xl bg-[var(--color-card)] skeleton" />,
});

type OriginMode = 'gps' | 'address';

export default function DayRoutePage() {
  const [mode, setMode] = useState<OriginMode>('gps');
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [originAddress, setOriginAddress] = useState('');
  const [destCity, setDestCity] = useState('');
  const [dayHours, setDayHours] = useState(8);
  const [maxStops, setMaxStops] = useState(25);
  const [roundTrip, setRoundTrip] = useState(true);
  const [includeHoreca, setIncludeHoreca] = useState(false);
  const [geoMsg, setGeoMsg] = useState('');

  const plan = useMutation({
    mutationFn: () =>
      api.dayRoutePlan({
        ...(mode === 'gps' && origin
          ? { origin_lat: origin.lat, origin_lng: origin.lng }
          : { origin_address: originAddress }),
        dest_city: destCity,
        day_hours: dayHours,
        max_stops: maxStops,
        round_trip: roundTrip,
        include_horeca: includeHoreca,
      }),
  });

  const useMyLocation = () => {
    setGeoMsg('Locating…');
    if (!navigator.geolocation) {
      setGeoMsg('This device has no location. Type an address instead.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setOrigin({ lat: p.coords.latitude, lng: p.coords.longitude });
        setGeoMsg('Got your location.');
      },
      () => setGeoMsg('Location blocked. Type a start address instead.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const canPlan =
    destCity.trim().length > 1 &&
    (mode === 'address' ? originAddress.trim().length > 1 : !!origin);

  const d: DayRoutePayload | undefined = plan.data;
  const gmapsUrl = d ? buildGmaps(d) : '';

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
          <Navigation size={24} className="text-[var(--color-accent)]" />
          Plan my day
        </h1>
        <p className="text-sm text-[var(--color-muted)]">
          Where you start, the city you are heading to, and we build the shortest drive that hits the
          most stores worth visiting on the way there, around the city, and back.
        </p>
      </header>

      {/* Form */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          {/* Origin */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-2">
              Starting from
            </div>
            <div className="flex gap-2 mb-2">
              <TabBtn active={mode === 'gps'} onClick={() => setMode('gps')}>
                <LocateFixed size={14} /> My location
              </TabBtn>
              <TabBtn active={mode === 'address'} onClick={() => setMode('address')}>
                <MapPin size={14} /> Home / address
              </TabBtn>
            </div>
            {mode === 'gps' ? (
              <div className="flex items-center gap-3">
                <Button variant="secondary" onClick={useMyLocation} className="h-11">
                  <LocateFixed size={16} /> Use my location
                </Button>
                <span className="text-sm text-[var(--color-muted)]">
                  {origin ? `${origin.lat.toFixed(3)}, ${origin.lng.toFixed(3)}` : geoMsg || 'Not set'}
                </span>
              </div>
            ) : (
              <input
                value={originAddress}
                onChange={(e) => setOriginAddress(e.target.value)}
                placeholder="Home base or a start address (e.g. Brampton, or 55 Bloor St W)"
                className="w-full h-11 px-3 rounded-lg bg-[var(--color-background)] border border-[var(--color-card-border)]"
              />
            )}
          </div>

          {/* Destination */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-2">
              Heading to (city)
            </div>
            <input
              value={destCity}
              onChange={(e) => setDestCity(e.target.value)}
              placeholder="e.g. Ottawa, Kingston, London, Barrie"
              className="w-full h-11 px-3 rounded-lg bg-[var(--color-background)] border border-[var(--color-card-border)]"
            />
          </div>

          {/* Tunables */}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-[var(--color-muted)]">Hours in the day</span>
              <input
                type="number" min={2} max={14} value={dayHours}
                onChange={(e) => setDayHours(Number(e.target.value))}
                className="w-full h-11 px-3 mt-1 rounded-lg bg-[var(--color-background)] border border-[var(--color-card-border)]"
              />
            </label>
            <label className="text-sm">
              <span className="text-[var(--color-muted)]">Max stops</span>
              <input
                type="number" min={1} max={40} value={maxStops}
                onChange={(e) => setMaxStops(Number(e.target.value))}
                className="w-full h-11 px-3 mt-1 rounded-lg bg-[var(--color-background)] border border-[var(--color-card-border)]"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-4">
            <Toggle checked={roundTrip} onChange={setRoundTrip} label="Return home at the end" />
            <Toggle checked={includeHoreca} onChange={setIncludeHoreca}
              label="Add bars & restaurants on the way" />
          </div>

          <Button onClick={() => plan.mutate()} disabled={!canPlan || plan.isPending} className="w-full h-12">
            {plan.isPending ? <><Loader2 size={16} className="animate-spin" /> Building route…</> : 'Build my route'}
          </Button>
          {plan.isError && (
            <p className="text-sm text-[var(--color-danger)]">
              {(plan.error as Error)?.message || 'Could not build a route.'}
            </p>
          )}
          {d?.error && <p className="text-sm text-[var(--color-danger)]">{d.error}</p>}
        </CardContent>
      </Card>

      {/* Result */}
      {d && !d.error && (
        <>
          {!d.day_feasible && (
            <div className="rounded-xl border border-[var(--color-danger)] bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] p-3 text-sm">
              <b>Too much for one day.</b> {d.advice}
            </div>
          )}
          {d.day_feasible && d.advice && (
            <div className="rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card)] p-3 text-sm text-[var(--color-muted)]">
              {d.advice}
            </div>
          )}

          {/* Totals */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat icon={<Store size={15} />} label="stops" value={String(d.stop_count)} />
            <Stat icon={<Navigation size={15} />} label="km" value={String(d.totals.drive_km)} />
            <Stat icon={<Clock size={15} />} label="hours" value={String(d.totals.total_hours)} />
            <Stat icon={<Fuel size={15} />} label="fuel" value={`$${d.totals.cost}`} />
          </div>

          <Card><CardContent className="pt-3">
            <RouteMap plan={d} />
            <div className="flex items-center justify-between mt-2 text-xs text-[var(--color-muted)]">
              <span>
                Distances {d.matrix_source.startsWith('osrm') ? 'from live road data' : 'estimated'} ·{' '}
                {d.dropped_for_time > 0 ? `${d.dropped_for_time} more didn't fit` : 'all corridor stores fit'}
              </span>
              {gmapsUrl && (
                <a href={gmapsUrl} target="_blank" rel="noopener noreferrer"
                   className="text-[var(--color-accent)] font-semibold">
                  Open in Google Maps
                </a>
              )}
            </div>
          </CardContent></Card>

          {/* Stop list */}
          <div className="space-y-2">
            {d.stops.map((s) => (
              <Link key={s.seq} href={`/stores/${s.store_number}`}
                className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-border)]">
                <div className="shrink-0 w-7 h-7 rounded-full grid place-items-center text-xs font-bold text-white"
                  style={{ background: s.gap ? '#16876a' : s.low_stock ? '#b8860b' : '#1a1a3a' }}>
                  {s.seq}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">#{s.store_number} · {s.account}</div>
                  <div className="text-xs text-[var(--color-muted)] truncate">
                    {s.address}, {s.city}
                  </div>
                </div>
                <div className="text-right text-xs">
                  {s.gap && <span className="px-1.5 py-0.5 rounded bg-[#16876a] text-white">GAP</span>}
                  {s.low_stock && <span className="px-1.5 py-0.5 rounded bg-[#b8860b] text-white">LOW</span>}
                  <div className="text-[var(--color-muted)] mt-0.5">{s.leg_km} km · {s.cumulative_km} km in</div>
                </div>
              </Link>
            ))}
          </div>

          {/* HORECA */}
          {d.horeca_stops.length > 0 && (
            <Card><CardContent className="pt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-2 flex items-center gap-1">
                <Wine size={14} /> On-trade near the route
              </div>
              <div className="space-y-1.5">
                {d.horeca_stops.map((h) => (
                  <Link key={h.id} href={`/horeca/${h.id}`}
                    className="flex items-center justify-between text-sm p-2 rounded-lg bg-[var(--color-background)]">
                    <span className="truncate">{h.name} <span className="text-[var(--color-muted)]">· {h.account_type}</span></span>
                    <span className="text-xs text-[var(--color-muted)] shrink-0">{h.detour_km} km off</span>
                  </Link>
                ))}
              </div>
            </CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 h-9 rounded-full text-sm font-medium ${
        active ? 'bg-[var(--color-accent)] text-[var(--color-primary-fg)]'
               : 'bg-[var(--color-card)] border border-[var(--color-card-border)]'}`}>
      {children}
    </button>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <span className={`w-10 h-6 rounded-full transition-colors relative ${checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-card-border)]'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      {label}
    </label>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-card)] border border-[var(--color-card-border)] p-3">
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-[var(--color-muted)] flex items-center gap-1">{icon}{label}</div>
    </div>
  );
}

function buildGmaps(d: DayRoutePayload): string {
  const pts: string[] = [`${d.origin.lat},${d.origin.lng}`];
  d.stops.forEach((s) => pts.push(`${s.lat},${s.lng}`));
  if (d.round_trip) pts.push(`${d.origin.lat},${d.origin.lng}`);
  return `https://www.google.com/maps/dir/${pts.join('/')}`;
}
