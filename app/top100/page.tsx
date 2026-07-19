'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListOrdered, RefreshCw, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * TOP-100 TARGET BOARDS — three curated hunt lists, area-quota'd across the
 * GTHA (Downtown Core, North York, Scarborough, Etobicoke, Mississauga,
 * Brampton, Vaughan, Richmond Hill, Markham):
 *   • Indian Top-100 — the portfolio IS the menu story
 *   • General Top-100 — licensed independents in priority trade areas
 *   • Volume Top-100 — banquet halls, hotels, clubs, cocktail rooms
 * Built from the AGCO licensed universe + our own research.
 */

const LISTS = [
  { key: 'indian', label: 'Indian Top-100' },
  { key: 'general', label: 'General Top-100' },
  { key: 'volume', label: 'Volume Top-100' },
];

export default function Top100Page() {
  const qc = useQueryClient();
  const [list, setList] = useState('indian');
  const data = useQuery({ queryKey: ['top100', list], queryFn: () => api.top100(list), retry: 1 });
  const build = useMutation({
    mutationFn: () => api.top100Build(list),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['top100', list] }),
  });

  const rows = data.data?.rows ?? [];
  const areas = Array.from(new Set(rows.map((r) => r.area).filter(Boolean)));

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <ListOrdered size={24} className="text-[var(--color-accent)]" />
            Top-100 Targets
          </h1>
          <p className="text-sm text-[var(--color-muted)]">
            The hunt lists: licensed, categorized, area-balanced, research-backed.
          </p>
        </div>
        <button
          onClick={() => build.mutate()}
          disabled={build.isPending}
          className="flex items-center gap-2 h-11 px-4 rounded-lg border text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw size={15} className={build.isPending ? 'animate-spin' : ''} />
          Rebuild from data
        </button>
      </header>

      <div className="flex gap-2">
        {LISTS.map((l) => (
          <button
            key={l.key}
            onClick={() => setList(l.key)}
            className={`h-10 px-4 rounded-lg text-sm font-medium border ${
              list === l.key ? 'bg-[var(--color-primary)] text-[var(--color-primary-fg)] border-transparent' : ''
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {data.isLoading && <Card><CardContent className="pt-4 text-sm text-[var(--color-muted)]">Loading…</CardContent></Card>}
      {rows.length === 0 && !data.isLoading && (
        <Card><CardContent className="pt-4 text-sm text-[var(--color-muted)]">
          No entries yet — press “Rebuild from data”.
        </CardContent></Card>
      )}

      {areas.map((area) => (
        <Card key={area}>
          <CardHeader><CardTitle>{area} <span className="text-xs font-normal text-[var(--color-muted)]">({rows.filter((r) => r.area === area).length})</span></CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rows.filter((r) => r.area === area).map((r) => (
                <div key={`${r.rank}-${r.name}`} className="flex items-start justify-between gap-3 text-sm border-b last:border-0 pb-2">
                  <div className="min-w-0">
                    <span className="font-medium">
                      {r.rank}. {r.name}
                      {r.source === 'research' && <Star size={11} className="inline ml-1 text-[var(--color-accent)]" />}
                    </span>
                    <div className="text-[11px] text-[var(--color-muted)]">{r.why}</div>
                  </div>
                  <div className="shrink-0 text-[11px] flex gap-2">
                    {r.account_id ? (
                      <Link href={`/horeca/${r.account_id}`} className="underline">account</Link>
                    ) : r.licence_number ? (
                      <span className="badge">licensed</span>
                    ) : null}
                    <a href={r.google_maps_url} target="_blank" rel="noreferrer" className="underline">map</a>
                    <a href={r.yelp_url} target="_blank" rel="noreferrer" className="underline">yelp</a>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* research-only rows with no area bucket */}
      {rows.some((r) => !r.area) && (
        <Card>
          <CardHeader><CardTitle>Research picks (area TBD)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {rows.filter((r) => !r.area).map((r) => (
              <div key={`${r.rank}-${r.name}`} className="border-b last:border-0 pb-2">
                <span className="font-medium">{r.rank}. {r.name}</span>
                <span className="text-[11px] text-[var(--color-muted)] ml-2">{r.city} — {r.why}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
