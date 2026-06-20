'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Flame,
  Navigation,
  Camera,
  Loader2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MapPin,
  X,
  Minus,
  Plus,
  Database,
  Calendar,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  api,
  type RprBlitzCluster,
  type RprBlitzStore,
  type RprDisplayRow,
  type RprLogStatus,
  type RprTastingCreate,
} from '@/lib/api';
import { captureSilentGeo, type SilentGeoFix } from '@/lib/silent-geo';
import { useActiveRep } from '@/lib/active-rep';
import { REP_ROSTER } from '@/lib/reps';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatNumber, formatDate, cn } from '@/lib/utils';

/**
 * /rpr-blitz — Rock Paper Rum staff-tasting campaign (SKU 0045378).
 *
 * ~148 stores worked in geographic clusters ("runs") of 4–6, each with a
 * nearest-neighbour visit order and a one-tap Google Maps multi-stop link.
 * Per-store bottom sheet logs rep / status / staff count / bottles /
 * DISPLAY SECURED / shelf position / notes + a canvas-compressed shelf
 * photo (emailed to Ikshit when the backend has Resend configured).
 * GPS attaches silently (lib/silent-geo) — no geo UI is ever shown.
 */

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'done', label: 'Done' },
  { id: 'secured', label: 'Display secured' },
  { id: 'nodisplay', label: 'No display' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const STATUS_CHIP: Record<string, string> = {
  pending: 'change-BASELINE',
  done: 'change-NEW_LISTING',
  attempted: 'change-STATUS_FLIP',
  declined: 'change-DELISTED',
};

const SHELF_POSITIONS = ['eye-level', 'mid', 'bottom', 'end-cap', 'checkout', 'other'] as const;

// ---------------------------------------------------------------------------
// Google Maps multi-stop links (client-side, address-based — addresses route
// better than centroid lat/lng). Google caps a directions deep-link at ~10
// stops: 9 waypoints + destination.
// ---------------------------------------------------------------------------
const MAX_WAYPOINTS = 9;

function waypointString(s: RprBlitzStore): string {
  return s.address
    ? `${s.address}, ${s.city}`
    : `LCBO ${s.cross_streets}, ${s.city}, Ontario`;
}

function buildNavLinks(
  stores: RprBlitzStore[],
  origin: SilentGeoFix | null,
): { label: string; url: string }[] {
  const ordered = [...stores].sort((a, b) => a.seq_in_cluster - b.seq_in_cluster);
  if (ordered.length === 0) return [];
  const links: { label: string; url: string }[] = [];
  const chunkSize = MAX_WAYPOINTS + 1; // waypoints + destination per link
  for (let i = 0; i < ordered.length; i += chunkSize) {
    const chunk = ordered.slice(i, i + chunkSize);
    const dest = chunk[chunk.length - 1];
    let originStr: string;
    let waypoints = chunk.slice(0, -1);
    if (i > 0) {
      // Continuation link starts from the previous chunk's last stop.
      originStr = waypointString(ordered[i - 1]);
    } else if (origin) {
      originStr = `${origin.lat},${origin.lng}`;
    } else {
      originStr = waypointString(chunk[0]);
      waypoints = chunk.slice(1, -1);
    }
    const params = new URLSearchParams({
      api: '1',
      origin: originStr,
      destination: waypointString(dest),
    });
    if (waypoints.length > 0) {
      params.set('waypoints', waypoints.map(waypointString).join('|'));
    }
    links.push({
      label:
        ordered.length > chunkSize
          ? `Navigate ${i + 1}–${i + chunk.length}`
          : 'Navigate run',
      url: `https://www.google.com/maps/dir/?${params.toString()}`,
    });
  }
  return links;
}

// ---------------------------------------------------------------------------
// Client-side canvas photo compression: max edge 1280px, JPEG q0.72,
// stepping quality down to stay near the <300KB target. Returns RAW base64
// (data-url prefix stripped) — the API stores raw base64 and 413s > 800k chars.
// ---------------------------------------------------------------------------
const MAX_EDGE = 1280;
const TARGET_B64_CHARS = 400_000; // ~300KB binary

async function compressPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read that image.'));
      el.src = url;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported on this device.');
    ctx.drawImage(img, 0, 0, w, h);
    let dataUrl = '';
    for (const q of [0.72, 0.6, 0.5, 0.4]) {
      dataUrl = canvas.toDataURL('image/jpeg', q);
      if (dataUrl.length <= TARGET_B64_CHARS) break;
    }
    // Strip the data-url prefix — backend expects raw base64.
    return dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ---------------------------------------------------------------------------

export default function RprBlitzPage() {
  const qc = useQueryClient();
  const [activeRep] = useActiveRep();
  const [tab, setTab] = useState<TabId>('all');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [logStore, setLogStore] = useState<RprBlitzStore | null>(null);
  const [fix, setFix] = useState<SilentGeoFix | null>(null);

  // Silent GPS for cluster sorting + nav origin — never surfaced in the UI.
  useEffect(() => {
    let alive = true;
    captureSilentGeo().then((f) => {
      if (alive) setFix(f);
    });
    return () => {
      alive = false;
    };
  }, []);

  const blitz = useQuery({ queryKey: ['rpr-blitz'], queryFn: () => api.rprBlitz() });

  const displaysSecured = useQuery({
    queryKey: ['rpr-displays', true],
    queryFn: () => api.rprDisplays(true),
    enabled: tab === 'secured',
  });
  const displaysMissing = useQuery({
    queryKey: ['rpr-displays', false],
    queryFn: () => api.rprDisplays(false),
    enabled: tab === 'nodisplay',
  });

  const ingest = useMutation({
    mutationFn: () => api.rprIngest(),
    onSuccess: (res) => {
      toast.success(
        `Loaded ${res.stores} stores into ${res.clustered} clusters` +
          (res.sod_enriched ? ` · ${res.sod_enriched} enriched from SOD` : ''),
      );
      qc.invalidateQueries({ queryKey: ['rpr-blitz'] });
    },
    onError: (err: unknown) => toast.error((err as Error).message),
  });

  const totals = blitz.data?.totals;

  // Sort clusters by distance from the device when we have a fix,
  // otherwise by pending count (most work first).
  const clusters = useMemo<RprBlitzCluster[]>(() => {
    const list = [...(blitz.data?.clusters ?? [])];
    if (fix) {
      list.sort(
        (a, b) =>
          haversineKm(fix.lat, fix.lng, a.centroid_lat, a.centroid_lng) -
          haversineKm(fix.lat, fix.lng, b.centroid_lat, b.centroid_lng),
      );
    } else {
      const pendingOf = (c: RprBlitzCluster) =>
        c.stores.filter((s) => s.status === 'pending').length;
      list.sort((a, b) => pendingOf(b) - pendingOf(a));
    }
    return list;
  }, [blitz.data?.clusters, fix]);

  const pct = totals && totals.stores > 0 ? Math.round((totals.done / totals.stores) * 100) : 0;
  const displayTab = tab === 'secured' || tab === 'nodisplay';
  const displayRows = tab === 'secured' ? displaysSecured : displaysMissing;
  const allStores = useMemo<RprBlitzStore[]>(
    () => (blitz.data?.clusters ?? []).flatMap((c) => c.stores),
    [blitz.data?.clusters],
  );

  return (
    <div className="space-y-6 pb-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
          <Flame size={24} className="text-[var(--color-accent)]" />
          RPR Tasting Blitz
        </h1>
        <p className="text-sm text-[var(--color-muted)]">
          Rock Paper Rum staff tastings (SKU 0045378). Work the runs in order, log every
          store, secure the display, shoot the shelf.
        </p>
      </header>

      {/* 1. Progress header */}
      <Card>
        <CardContent className="pt-4 sm:pt-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-4xl font-bold tabular-nums">
                {formatNumber(totals?.done)}
                <span className="text-xl text-[var(--color-muted)] font-semibold">
                  /{formatNumber(totals?.stores)}
                </span>
              </div>
              <div className="text-xs text-[var(--color-muted)] mt-0.5">
                stores tasted · {pct}%
              </div>
            </div>
            <div className="text-right text-xs text-[var(--color-muted)]">
              {totals?.stores || 148} stores · Jun 15 – Jul 3
            </div>
          </div>
          <div className="mt-3 h-2.5 rounded-full bg-[var(--color-background)] border border-[var(--color-card-border)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--color-success)] transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex gap-1.5 flex-wrap mt-3">
            <span className="change-chip change-NEW_LISTING">
              {formatNumber(totals?.displays_secured)} displays secured
            </span>
            <span className="change-chip change-DELISTED">
              {formatNumber(totals?.displays_missing)} no display
            </span>
            <span className="change-chip change-BASELINE">
              {totals ? totals.bottles_used.toFixed(1) : '—'} bottles used
            </span>
            <span className="change-chip change-BASELINE">
              {formatNumber(totals?.photos)} photos
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 1b. Schedule + calendar */}
      {blitz.data?.ingested && (
        <ScheduleStrip activeRep={activeRep ?? ''} stores={allStores} />
      )}

      {/* 2. Filter tabs */}
      <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1">
        {TABS.map((t) => {
          const sel = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 px-4 py-2.5 rounded-full text-sm font-semibold min-h-11 ${
                sel
                  ? 'bg-[var(--color-accent)] text-[#2a1f0f]'
                  : 'bg-[var(--color-card)] border border-[var(--color-card-border)]'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 3. Ingest bootstrap */}
      {blitz.data && blitz.data.ingested === false && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database size={16} className="text-[var(--color-accent)]" />
              Set up the blitz
            </CardTitle>
            <CardDescription>
              The campaign table is empty. Load the bundled Rock Paper Rum store list — it
              clusters the stores into geographic runs automatically (safe to re-run, logs
              are kept).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => ingest.mutate()} disabled={ingest.isPending}>
              {ingest.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Database size={14} />
              )}
              {ingest.isPending ? 'Loading…' : 'Load the 148-store list'}
            </Button>
          </CardContent>
        </Card>
      )}

      {blitz.isLoading &&
        Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-28" />)}
      {blitz.isError && (
        <div className="m-card text-center py-8 text-sm text-[var(--color-danger)]">
          {(blitz.error as Error).message}
        </div>
      )}

      {/* 7. Display secured / No display view (from /api/rpr/displays) */}
      {displayTab && (
        <div className="space-y-2.5">
          {displayRows.isLoading &&
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-16" />)}
          {displayRows.isError && (
            <div className="m-card text-center py-6 text-sm text-[var(--color-danger)]">
              {(displayRows.error as Error).message}
            </div>
          )}
          {displayRows.data?.length === 0 && (
            <div className="m-card text-center py-8 text-muted text-sm">
              {tab === 'secured'
                ? 'No displays secured yet — go win one.'
                : 'No stores logged without a display. Good.'}
            </div>
          )}
          {displayRows.data?.map((row: RprDisplayRow) => (
            <div key={row.store_number} className="m-card">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">
                    {row.account_label || `LCBO #${row.store_number}`}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {row.city}
                    {row.last_rep ? ` · ${row.last_rep}` : ''}
                    {row.last_tasted_at ? ` · ${formatDate(row.last_tasted_at)}` : ''}
                  </div>
                </div>
                <span
                  className={`change-chip shrink-0 ${
                    row.display_secured ? 'change-NEW_LISTING' : 'change-DELISTED'
                  }`}
                >
                  {row.display_secured ? 'Display ✓' : 'No display'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4–6. Cluster cards */}
      {!displayTab &&
        clusters.map((c) => {
          const visible =
            tab === 'all'
              ? c.stores
              : c.stores.filter((s) =>
                  tab === 'pending' ? s.status === 'pending' : s.status === 'done',
                );
          if (visible.length === 0 && tab !== 'all') return null;
          const isOpen = expanded === c.cluster_id;
          const navLinks = buildNavLinks(visible, fix);
          return (
            <Card key={c.cluster_id}>
              <button
                className="w-full text-left"
                onClick={() => setExpanded(isOpen ? null : c.cluster_id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="flex items-center gap-2 flex-wrap">
                        {c.name}
                        {c.suggested_rep && (
                          <span
                            className="change-chip change-BASELINE"
                            title="Soft routing default only — any rep can work any store"
                          >
                            {c.suggested_rep}
                          </span>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {c.done_count}/{c.store_count} done
                        {fix
                          ? ` · ${haversineKm(fix.lat, fix.lng, c.centroid_lat, c.centroid_lng).toFixed(0)} km away`
                          : ''}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-sm font-bold tabular-nums ${
                          c.done_count >= c.store_count
                            ? 'text-[var(--color-success)]'
                            : 'text-[var(--color-muted)]'
                        }`}
                      >
                        {c.done_count}/{c.store_count}
                      </span>
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </CardHeader>
              </button>
              <CardContent className="pt-0 space-y-2.5">
                <div className="flex gap-2 flex-wrap">
                  {navLinks.map((l) => (
                    <a
                      key={l.url}
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 h-11 px-4 rounded-lg text-sm font-medium bg-[var(--color-accent)] text-[#2a1f0f] active:scale-[0.98]"
                    >
                      <Navigation size={14} /> {l.label}
                    </a>
                  ))}
                </div>
                {isOpen &&
                  visible
                    .slice()
                    .sort((a, b) => a.seq_in_cluster - b.seq_in_cluster)
                    .map((s) => (
                      <button
                        key={s.store_number}
                        onClick={() => setLogStore(s)}
                        className={cn(
                          'm-card block w-full text-left',
                          s.status === 'done' && 'border-[rgba(18,194,140,0.45)]',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap mb-1">
                              <span className={`change-chip ${STATUS_CHIP[s.status]}`}>
                                {s.status}
                              </span>
                              {s.display_secured === true && (
                                <span className="change-chip change-NEW_LISTING">display ✓</span>
                              )}
                              {s.display_secured === false && (
                                <span className="change-chip change-DELISTED">no display</span>
                              )}
                              {s.on_hand != null && (
                                <span className="change-chip change-BASELINE">
                                  {formatNumber(s.on_hand)} on hand
                                </span>
                              )}
                              {s.photo_count > 0 && (
                                <span className="change-chip change-BASELINE">
                                  <Camera size={11} /> {s.photo_count}
                                </span>
                              )}
                            </div>
                            <div className="font-semibold flex items-center gap-1.5">
                              {s.status === 'done' && (
                                <CheckCircle2
                                  size={15}
                                  className="text-[var(--color-success)] shrink-0"
                                />
                              )}
                              <span className="truncate">
                                {s.account_label || `LCBO #${s.store_number}`}
                              </span>
                            </div>
                            <div className="text-xs text-muted mt-0.5 flex items-center gap-1">
                              <MapPin size={11} className="shrink-0" />
                              {[s.address || s.cross_streets, s.city]
                                .filter(Boolean)
                                .join(', ') || '—'}
                            </div>
                            {s.last_rep && (
                              <div className="text-xs text-muted mt-0.5">
                                {s.last_rep}
                                {s.last_tasted_at ? ` · ${formatDate(s.last_tasted_at)}` : ''}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0 text-xs text-muted tabular-nums">
                            #{s.seq_in_cluster}
                          </div>
                        </div>
                      </button>
                    ))}
              </CardContent>
            </Card>
          );
        })}

      {!displayTab &&
        blitz.data &&
        blitz.data.ingested &&
        clusters.length > 0 &&
        tab !== 'all' &&
        clusters.every(
          (c) =>
            c.stores.filter((s) =>
              tab === 'pending' ? s.status === 'pending' : s.status === 'done',
            ).length === 0,
        ) && (
          <div className="m-card text-center py-8 text-muted text-sm">
            {tab === 'pending' ? 'Nothing pending — blitz complete.' : 'No stores done yet.'}
          </div>
        )}

      {/* 5–6. Bottom log sheet */}
      {logStore && (
        <LogSheet
          store={logStore}
          defaultRep={activeRep ?? ''}
          onClose={() => setLogStore(null)}
          onLogged={() => {
            setLogStore(null);
            qc.invalidateQueries({ queryKey: ['rpr-blitz'] });
            qc.invalidateQueries({ queryKey: ['rpr-displays'] });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom sheet: log a tasting at one store.
// ---------------------------------------------------------------------------
/** Plan future tasting stops on a date + subscribe to a phone calendar feed.
 *  Lives above the runs so a rep can lay out their week, then work the runs. */
function ScheduleStrip({ activeRep, stores }: { activeRep: string; stores: RprBlitzStore[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rep, setRep] = useState(activeRep || 'Ikshit');
  const [storeNum, setStoreNum] = useState('');
  const [date, setDate] = useState('');

  const list = useQuery({
    queryKey: ['rpr-schedule', rep],
    queryFn: () => api.rprScheduleList({ rep }),
    enabled: Boolean(rep),
  });

  const create = useMutation({
    mutationFn: () =>
      api.rprScheduleCreate({ store_number: Number(storeNum), rep, planned_date: date }),
    onSuccess: () => {
      toast.success('Stop scheduled');
      setStoreNum('');
      setDate('');
      qc.invalidateQueries({ queryKey: ['rpr-schedule', rep] });
      qc.invalidateQueries({ queryKey: ['rpr-blitz'] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.rprScheduleDelete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rpr-schedule', rep] });
      qc.invalidateQueries({ queryKey: ['rpr-blitz'] });
    },
  });

  const upcoming = (list.data ?? []).filter((s) => s.status === 'planned');

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar size={16} className="text-[var(--color-accent)]" />
            Schedule
          </CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={rep}
              onChange={(e) => setRep(e.target.value)}
              className="select h-9 text-sm"
            >
              {REP_ROSTER.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <a
              href={api.rprCalendarUrl(rep)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-accent)] whitespace-nowrap"
            >
              <Calendar size={13} /> Subscribe
            </a>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {upcoming.length === 0 && (
          <div className="text-xs text-muted">No planned stops for {rep} yet.</div>
        )}
        {upcoming.slice(0, 6).map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-2 p-2 rounded bg-[var(--color-background)] border border-[var(--color-card-border)] text-xs"
          >
            <div className="flex-1 min-w-0">
              <span className="font-semibold">{formatDate(s.planned_date)}</span>{' '}
              <span className="text-muted">· {s.account_label || `#${s.store_number}`}</span>
              {s.notes && <span className="text-muted"> — {s.notes}</span>}
            </div>
            <button
              onClick={() => del.mutate(s.id)}
              className="text-[var(--color-danger)] shrink-0"
              aria-label="Remove planned stop"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        {!open ? (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-accent)]"
          >
            <Plus size={14} /> Plan a stop
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <select
              value={storeNum}
              onChange={(e) => setStoreNum(e.target.value)}
              className="select col-span-2"
            >
              <option value="">— pick a store —</option>
              {stores.map((s) => (
                <option key={s.store_number} value={s.store_number}>
                  #{s.store_number} {s.city} {s.cross_streets ? `· ${s.cross_streets}` : ''}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="select"
            />
            <Button
              onClick={() => create.mutate()}
              disabled={!storeNum || !date || create.isPending}
            >
              {create.isPending ? 'Saving…' : 'Schedule'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LogSheet({
  store,
  defaultRep,
  onClose,
  onLogged,
}: {
  store: RprBlitzStore;
  defaultRep: string;
  onClose: () => void;
  onLogged: () => void;
}) {
  const qc = useQueryClient();
  const [rep, setRep] = useState(defaultRep);
  const [status, setStatus] = useState<RprLogStatus>('done');
  const [staffCount, setStaffCount] = useState(0);
  const [bottles, setBottles] = useState('0.33');
  const [displaySecured, setDisplaySecured] = useState<boolean | null>(null);
  const [shelfPosition, setShelfPosition] = useState('');
  const [shelfOther, setShelfOther] = useState('');
  const [notes, setNotes] = useState('');
  const [caption, setCaption] = useState('');
  const [photoB64, setPhotoB64] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Existing photos for a re-visit (img src hits /api/rpr/photo/<id> directly).
  const photos = useQuery({
    queryKey: ['rpr-photos', store.store_number],
    queryFn: () => api.rprPhotos({ store_number: store.store_number, limit: 12 }),
    enabled: store.photo_count > 0,
  });

  const submit = useMutation({
    mutationFn: async () => {
      const fix = await captureSilentGeo(); // silent — never blocks > 6s
      const body: RprTastingCreate = {
        store_number: store.store_number,
        rep,
        status,
        staff_count: staffCount,
        bottles_used: parseFloat(bottles) || 0.33,
        display_secured: displaySecured,
        shelf_position:
          shelfPosition === 'other'
            ? shelfOther.trim()
              ? `other:${shelfOther.trim()}`
              : 'other'
            : shelfPosition,
        notes: notes.trim(),
      };
      if (fix) {
        body.lat = fix.lat;
        body.lng = fix.lng;
      }
      if (photoB64) {
        body.photo_b64 = photoB64;
        body.photo_caption = caption.trim();
      }
      return api.rprLogTasting(body);
    },
    onSuccess: (res) => {
      let msg = `Logged store #${store.store_number}`;
      if (res.photo_id != null) {
        msg += res.emailed
          ? ' · photo emailed to Ikshit'
          : ' · photo saved (email not configured)';
      }
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ['rpr-photos', store.store_number] });
      onLogged();
    },
    onError: (err: unknown) => toast.error((err as Error).message),
  });

  async function onPickPhoto(file: File | undefined) {
    if (!file) return;
    setCompressing(true);
    try {
      setPhotoB64(await compressPhoto(file));
    } catch (err) {
      toast.error((err as Error).message);
      setPhotoB64(null);
    } finally {
      setCompressing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto bg-[var(--color-card)] border-t sm:border border-[var(--color-card-border)] rounded-t-2xl sm:rounded-b-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-3 bg-[var(--color-card)] border-b border-[var(--color-card-border)]">
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">
              {store.account_label || `LCBO #${store.store_number}`}
            </div>
            <div className="text-xs text-muted truncate">
              {[store.address || store.cross_streets, store.city].filter(Boolean).join(', ')}
            </div>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="h-11 w-11 shrink-0 rounded-lg flex items-center justify-center hover:bg-[#1a1f29]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {store.status !== 'pending' && (
            <div className="text-xs text-muted">
              Already logged {store.last_rep ? `by ${store.last_rep}` : ''}
              {store.last_tasted_at ? ` on ${formatDate(store.last_tasted_at)}` : ''} — this
              will add a re-visit log.
            </div>
          )}

          {/* Existing photo thumbnails */}
          {store.photo_count > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(photos.data ?? []).map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.id}
                  src={api.rprPhotoUrl(p.id)}
                  alt={p.caption || `Shelf photo, store ${p.store_number}`}
                  className="h-20 w-20 shrink-0 rounded-lg object-cover border border-[var(--color-card-border)]"
                  loading="lazy"
                />
              ))}
              {photos.isLoading &&
                Array.from({ length: Math.min(store.photo_count, 3) }).map((_, i) => (
                  <div key={i} className="skeleton h-20 w-20 shrink-0 rounded-lg" />
                ))}
            </div>
          )}

          <Field label="Rep">
            <select value={rep} onChange={(e) => setRep(e.target.value)} className="select w-full">
              <option value="">— pick rep —</option>
              {REP_ROSTER.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Status">
            <div className="flex gap-2">
              {(['done', 'attempted', 'declined'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatus(st)}
                  className={`flex-1 px-3 py-2.5 rounded-lg font-semibold text-sm capitalize ${
                    status === st
                      ? 'bg-[var(--color-accent)] text-[#2a1f0f]'
                      : 'bg-[var(--color-background)] border border-[var(--color-card-border)]'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </Field>

          {/* THE key field — big and prominent */}
          <Field label="Display secured?">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDisplaySecured(displaySecured === true ? null : true)}
                className={`px-3 py-4 rounded-xl font-bold text-base border-2 ${
                  displaySecured === true
                    ? 'bg-[rgba(18,194,140,0.18)] border-[var(--color-success)] text-[var(--color-success)]'
                    : 'bg-[var(--color-background)] border-[var(--color-card-border)]'
                }`}
              >
                ✓ Display secured
              </button>
              <button
                type="button"
                onClick={() => setDisplaySecured(displaySecured === false ? null : false)}
                className={`px-3 py-4 rounded-xl font-bold text-base border-2 ${
                  displaySecured === false
                    ? 'bg-[rgba(239,75,75,0.15)] border-[var(--color-danger)] text-[var(--color-danger)]'
                    : 'bg-[var(--color-background)] border-[var(--color-card-border)]'
                }`}
              >
                ✗ No display
              </button>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Staff tasted">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Fewer staff"
                  onClick={() => setStaffCount((n) => Math.max(0, n - 1))}
                  className="h-11 w-11 shrink-0 rounded-lg bg-[var(--color-background)] border border-[var(--color-card-border)] flex items-center justify-center"
                >
                  <Minus size={16} />
                </button>
                <div className="flex-1 text-center text-xl font-bold tabular-nums">
                  {staffCount}
                </div>
                <button
                  type="button"
                  aria-label="More staff"
                  onClick={() => setStaffCount((n) => n + 1)}
                  className="h-11 w-11 shrink-0 rounded-lg bg-[var(--color-background)] border border-[var(--color-card-border)] flex items-center justify-center"
                >
                  <Plus size={16} />
                </button>
              </div>
            </Field>
            <Field label="Bottles used">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={bottles}
                onChange={(e) => setBottles(e.target.value)}
                className="select w-full"
              />
            </Field>
          </div>

          <Field label="Shelf position">
            <select
              value={shelfPosition}
              onChange={(e) => setShelfPosition(e.target.value)}
              className="select w-full"
            >
              <option value="">— not noted —</option>
              {SHELF_POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {shelfPosition === 'other' && (
              <input
                type="text"
                value={shelfOther}
                onChange={(e) => setShelfOther(e.target.value)}
                placeholder="Describe the spot…"
                className="select w-full mt-2"
                maxLength={120}
              />
            )}
          </Field>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Staff reaction, competitor activity, manager name…"
              rows={2}
              className="select w-full min-h-[64px] py-2"
            />
          </Field>

          <Field label="Shelf photo">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onPickPhoto(e.target.files?.[0])}
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => fileRef.current?.click()}
                disabled={compressing}
              >
                {compressing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Camera size={14} />
                )}
                {compressing ? 'Compressing…' : photoB64 ? 'Retake photo' : 'Take photo'}
              </Button>
              {photoB64 && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/jpeg;base64,${photoB64}`}
                  alt="Shelf photo preview"
                  className="h-16 w-16 rounded-lg object-cover border border-[var(--color-card-border)]"
                />
              )}
              {photoB64 && (
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => {
                    setPhotoB64(null);
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                  className="h-9 w-9 rounded-lg flex items-center justify-center text-[var(--color-muted)] hover:bg-[#1a1f29]"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {photoB64 && (
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Caption (optional)"
                className="select w-full mt-2"
                maxLength={140}
              />
            )}
          </Field>

          <Button
            className="w-full"
            size="lg"
            onClick={() => submit.mutate()}
            disabled={submit.isPending || compressing || !rep}
          >
            {submit.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CheckCircle2 size={16} />
            )}
            {submit.isPending
              ? 'Logging…'
              : !rep
                ? 'Pick a rep first'
                : `Log tasting${photoB64 ? ' + photo' : ''}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-muted font-semibold mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
