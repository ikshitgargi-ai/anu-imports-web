'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PackageOpen, Phone, Wine } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TRACKED_SKUS } from '@/lib/skus';

/**
 * MOVE BOTTLES — pick a SKU, get THE PLAY:
 *   1) where the stock sits, 2) which stores earn a staff tasting,
 *   3) which licensed venues to pitch within 3 km of that stock,
 *   4) which past buyers get the reorder call. Every bottle logged.
 */

export default function MoveBottlesPage() {
  const [sku, setSku] = useState('0049902');
  const play = useQuery({ queryKey: ['move-bottles', sku], queryFn: () => api.moveBottles(sku), retry: 1 });
  const p = play.data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
          <PackageOpen size={24} className="text-[var(--color-accent)]" />
          Move Bottles
        </h1>
        <p className="text-sm text-[var(--color-muted)]">Pick a SKU. The app hands you the play.</p>
      </header>

      <Card>
        <CardContent className="pt-4">
          <select value={sku} onChange={(e) => setSku(e.target.value)} className="select w-full sm:w-96">
            {TRACKED_SKUS.map((s) => (
              <option key={s.sku} value={s.sku}>{s.label}</option>
            ))}
          </select>
          {p && (
            <div className="mt-3 p-3 rounded-lg bg-[var(--color-card-border)]/30 text-sm">
              <strong>{p.total_stock_units} bottles</strong> in market · {p.play}
            </div>
          )}
        </CardContent>
      </Card>

      {p && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Wine size={16} /> Stock + tasting candidates</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {p.stock_by_store.map((s) => (
                <div key={s.store_number} className="flex justify-between border-b last:border-0 pb-1.5">
                  <span>#{s.store_number} {s.store} <span className="text-[var(--color-muted)]">· {s.address ? `${s.address}, ` : ''}{s.city}</span></span>
                  <span className="tabular-nums font-medium">{s.on_hand} btl
                    {p.tasting_candidates.some((t) => t.store_number === s.store_number) &&
                      <span className="badge status-active ml-1.5">tasting here</span>}
                  </span>
                </div>
              ))}
              {p.stock_by_store.length === 0 && <p className="text-[var(--color-muted)]">No stock on shelf — check the warehouse/allocation.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Pitch venues near the stock</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {p.pitch_venues_near_stock.map((v) => (
                <div key={v.name} className="flex items-start justify-between gap-2 border-b last:border-0 pb-1.5">
                  <div>
                    <span className="font-medium">{v.name}</span>
                    {v.independent && <span className="badge ml-1.5">indie</span>}
                    <div className="text-[11px] text-[var(--color-muted)]">
                      {v.km_from_stock} km from store #{v.near_store}
                    </div>
                  </div>
                  <div className="shrink-0 flex gap-2 text-[11px]">
                    {v.phone && <a href={`tel:${v.phone.replace(/[^0-9+]/g, '')}`} className="underline flex items-center gap-0.5"><Phone size={10} />call</a>}
                    <a href={v.google_maps_url} target="_blank" rel="noreferrer" className="underline">map</a>
                  </div>
                </div>
              ))}
              {p.pitch_venues_near_stock.length === 0 && (
                <p className="text-[var(--color-muted)]">Pitch ring fills as the sweep geocodes licensees near the stock.</p>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Reorder calls ({p.reorder_customers.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {p.reorder_customers.map((c) => (
                  <Link key={c.account_id} href={`/horeca/${c.account_id}`} className="badge status-active">
                    {c.name}
                  </Link>
                ))}
                {p.reorder_customers.length === 0 && (
                  <p className="text-sm text-[var(--color-muted)]">No past buyers of this SKU yet — the pitch ring is the play.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
