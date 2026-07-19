'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Phone, ShieldCheck, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * TEAMS — sales, marketing, outreach. One dataset, three worklists.
 *
 * Ranking is deliberately biased to the channels that move bottles: a walk-in
 * beats a call, a call beats an email, and email only ever appears where
 * consent is already on record. The suppression list is absolute.
 */

const ROLES = [
  { key: 'sales', label: 'Sales', blurb: 'Doors already open: reorder calls on customers who have gone quiet.' },
  { key: 'outreach', label: 'Outreach', blurb: 'Doors not yet open: licensed venues with a phone. Calls, never cold email.' },
  { key: 'marketing', label: 'Marketing', blurb: 'The pull side: staff tastings where the stock is actually sitting.' },
] as const;

export default function TeamsPage() {
  const [role, setRole] = useState<string>('sales');
  const q = useQuery({
    queryKey: ['team-queue', role],
    queryFn: () => api.teamQueue(role),
    retry: 1,
  });
  const current = ROLES.find((r) => r.key === role);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
          <Users size={24} className="text-[var(--color-accent)]" />
          Teams
        </h1>
        <p className="text-sm text-[var(--color-muted)]">
          Today&apos;s work for each role, drawn from the live data.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {ROLES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRole(r.key)}
            className={`badge ${role === r.key ? 'badge-listed' : ''}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-4 text-sm">
          <p>{current?.blurb}</p>
          <p className="mt-2 flex items-start gap-1.5 text-[var(--color-muted)] text-[12px]">
            <ShieldCheck size={14} className="shrink-0 mt-0.5" />
            {q.data?.rule ??
              'Visits and calls rank above email everywhere: they move more bottles and carry no anti-spam risk.'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{q.data?.count ?? 0} to work today</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {q.isLoading && (
            <div className="py-8 text-center text-[var(--color-muted)]">Building the list…</div>
          )}
          {q.isError && (
            <div className="py-8 text-center text-[var(--color-muted)]">
              Queue endpoint busy or deploying. Retry shortly.
            </div>
          )}
          {(q.data?.rows ?? []).map((r, i) => (
            <div key={i} className="flex items-start justify-between gap-3 border-b last:border-0 pb-2">
              <div className="min-w-0">
                <span className="font-medium">
                  {r.name ?? r.store_label ?? `Store #${r.store_number}`}
                </span>
                {r.do_not_contact && (
                  <span className="badge badge-delisted ml-2">
                    <AlertTriangle size={10} className="inline mr-0.5" />
                    do not contact
                  </span>
                )}
                <div className="text-[11px] text-[var(--color-muted)]">
                  {[r.address, r.city].filter(Boolean).join(', ')}
                </div>
                <div className="text-[11px] text-[var(--color-muted)] mt-0.5">{r.why}</div>
                {r.casl_note && (
                  <div className="text-[10px] text-[var(--color-muted)] mt-0.5 italic">
                    {r.casl_note}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right">
                <span className="badge">{r.action}</span>
                {r.phone && (
                  <a
                    href={`tel:${String(r.phone).replace(/[^0-9+]/g, '')}`}
                    className="block text-[11px] underline mt-1 flex items-center gap-0.5 justify-end"
                  >
                    <Phone size={10} /> call
                  </a>
                )}
              </div>
            </div>
          ))}
          {!q.isLoading && (q.data?.rows ?? []).length === 0 && (
            <p className="text-[var(--color-muted)] py-6 text-center">
              Nothing queued for this role right now.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
