'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MapPin, Navigation, Phone, Plus, Search, Crosshair } from 'lucide-react';
import { toast } from 'sonner';
import { api, type HorecaNearbyRow } from '@/lib/api';
import { REP_ROSTER } from '@/lib/reps';
import { useActiveRep } from '@/lib/active-rep';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const RADII = [
  { label: '20 km', km: 20 },
  { label: '50 km', km: 50 },
  { label: '100 km', km: 100 },
  { label: '100 km+', km: 999 },
];

export default function HorecaNearbyPage() {
  const [activeRep] = useActiveRep();
  const [address, setAddress] = useState('');
  const [radius, setRadius] = useState(50);
  const [discover, setDiscover] = useState(false);
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [gettingGPS, setGettingGPS] = useState(false);
  const [rep, setRep] = useState<string>(activeRep ?? '');

  const search = useMutation({
    mutationFn: (opts: { lat?: number; lng?: number; address?: string }) =>
      api.horecaNearby({
        ...opts,
        radius_km: radius,
        live: discover,
        limit: 300,
      }),
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const importOne = useMutation({
    mutationFn: (row: HorecaNearbyRow) =>
      api.prospectImport({
        accounts: [
          {
            name: row.name,
            address: row.address,
            city: row.city,
            postal: row.postal,
            lat: row.lat,
            lng: row.lng,
            account_type: row.account_type,
            phone: row.phone,
            website: '',
            cuisine: '',
            osm_id: row.osm_id,
            source: 'overpass',
            duplicate: false,
          },
        ],
        rep: rep || undefined,
      }),
    onSuccess: () => toast.success('Added to HORECA book as a prospect'),
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      toast.error('Geolocation not supported on this device');
      return;
    }
    setGettingGPS(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const o = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setOrigin(o);
        setAddress('');
        setGettingGPS(false);
        search.mutate(o);
      },
      (err) => {
        setGettingGPS(false);
        toast.error(`Location error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  function runSearch() {
    if (origin && !address) {
      search.mutate(origin);
    } else if (address.trim()) {
      search.mutate({ address: address.trim() });
    } else {
      toast.error('Tap “Use my location” or type an address');
    }
  }

  const data = search.data;

  return (
    <div className="space-y-5 pb-24">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
          <MapPin size={24} className="text-[var(--color-accent)]" />
          HORECA Near Me
        </h1>
        <p className="text-sm text-[var(--color-muted)]">
          Bars &amp; restaurants around you — drop a pin or type an address, pick a radius, get a
          walk-in list sorted by distance with one-tap directions.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Where are you?</CardTitle>
          <CardDescription>GTA and beyond. Live location is most accurate in-store.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={useMyLocation} disabled={gettingGPS} className="h-12">
              <Crosshair size={16} /> {gettingGPS ? 'Locating…' : 'Use my location'}
            </Button>
            <Button variant="secondary" onClick={runSearch} disabled={search.isPending} className="h-12">
              <Search size={16} /> {search.isPending ? 'Searching…' : 'Search'}
            </Button>
          </div>
          <input
            type="text"
            inputMode="text"
            placeholder="…or type an address / intersection / postal code"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setOrigin(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            className="select w-full"
          />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-medium mb-1.5">
              Radius
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {RADII.map((r) => (
                <button
                  key={r.km}
                  onClick={() => setRadius(r.km)}
                  className={`change-chip min-h-9 px-3 ${
                    radius === r.km
                      ? 'bg-[var(--color-accent)] text-[#2a1f0f]'
                      : 'bg-[var(--color-card)] border border-[var(--color-card-border)]'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={discover}
              onChange={(e) => setDiscover(e.target.checked)}
            />
            Discover NEW accounts from the live map (not just our book)
          </label>
          {discover && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-medium mb-1.5">
                Assign new adds to
              </div>
              <select value={rep} onChange={(e) => setRep(e.target.value)} className="select w-full">
                <option value="">— unassigned —</option>
                {REP_ROSTER.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      {data && (
        <Card>
          <CardHeader>
            <CardTitle>
              {data.count} {data.count === 1 ? 'account' : 'accounts'} within{' '}
              {typeof data.radius_km === 'string' ? data.radius_km : `${data.radius_km} km`}
            </CardTitle>
            <CardDescription>From {data.origin.label}. Closest first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {data.results.length === 0 && (
              <div className="text-center py-10 text-muted">
                Nothing here yet. Try a wider radius or turn on “Discover NEW accounts”.
              </div>
            )}
            {data.results.map((r, i) => (
              <div key={`${r.id ?? r.osm_id ?? i}`} className="m-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className="change-chip change-BASELINE">{r.account_type}</span>
                      {r.in_book ? (
                        <span className="change-chip change-STATUS_FLIP">in our book</span>
                      ) : (
                        <span className="change-chip change-NEW_LISTING">new</span>
                      )}
                      {r.status && r.status !== 'discovered' && (
                        <span className="text-[11px] text-muted">{r.status}</span>
                      )}
                    </div>
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-xs text-muted">
                      {[r.address, r.city].filter(Boolean).join(', ')}
                    </div>
                    {r.products_carried && (
                      <div className="text-xs text-[var(--color-accent)] mt-0.5">
                        carries: {r.products_carried}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <a
                        href={r.maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-accent)]"
                      >
                        <Navigation size={13} /> Directions
                      </a>
                      {r.phone && (
                        <a
                          href={`tel:${r.phone.replace(/[^0-9+]/g, '')}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold"
                        >
                          <Phone size={13} /> Call
                        </a>
                      )}
                      {!r.in_book && r.source === 'osm_live' && (
                        <button
                          onClick={() => importOne.mutate(r)}
                          disabled={importOne.isPending}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-success)]"
                        >
                          <Plus size={13} /> Add to book
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-2xl font-bold tabular-nums">{r.distance_km}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted">km</div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
