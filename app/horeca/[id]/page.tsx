'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, BadgeCheck, MapPin, MessageSquareText, Phone, ShoppingCart,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';

const ACTIVITY_TYPES = ['visit', 'call', 'tasting', 'email', 'delivery-check'];

export default function HorecaAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const accountId = Number(id);
  const qc = useQueryClient();

  const full = useQuery({
    queryKey: ['horeca-account', accountId],
    queryFn: () => api.horecaAccountFull(accountId),
    enabled: Number.isFinite(accountId),
  });
  const portfolio = useQuery({ queryKey: ['horeca-portfolio'], queryFn: api.horecaPortfolio });

  const [sku, setSku] = useState('');
  const [cases, setCases] = useState('');
  const [store, setStore] = useState('');
  const [rep, setRep] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [actType, setActType] = useState('visit');
  const [actNotes, setActNotes] = useState('');

  const refresh = () => qc.invalidateQueries({ queryKey: ['horeca-account', accountId] });

  const logOrder = useMutation({
    mutationFn: () =>
      api.horecaOrder({
        account_id: accountId,
        sku,
        cases: cases ? Number(cases) : 0,
        lcbo_store_number: store ? Number(store) : undefined,
        rep,
        notes: orderNotes,
      }),
    onSuccess: () => {
      setSku(''); setCases(''); setOrderNotes('');
      refresh();
    },
  });

  const logActivity = useMutation({
    mutationFn: () =>
      api.horecaLogActivity({
        account_id: accountId, rep, activity_type: actType, notes: actNotes,
      }),
    onSuccess: () => { setActNotes(''); refresh(); },
  });

  if (full.isLoading) return <div className="py-10 text-center text-sm text-[var(--color-muted)]">Loading account…</div>;
  if (!full.data) return <div className="py-10 text-center text-sm">Account not found. <Link className="underline" href="/horeca">Back to book</Link></div>;

  const { account: a, tier, cases_90d, agco_licence, orders, activities } = full.data;

  return (
    <div className="space-y-6">
      <Link href="/horeca" className="text-sm flex items-center gap-1 text-[var(--color-muted)]">
        <ArrowLeft size={14} /> HORECA book
      </Link>

      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold">{a.name}</h1>
          <p className="text-sm text-[var(--color-muted)]">
            {[a.address, a.city, a.postal].filter(Boolean).join(', ') || 'Address to confirm'}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className={`badge status-${a.status}`}>{a.status}</span>
            <span className="badge">{a.priority}</span>
            <span className="badge capitalize">{a.account_type}</span>
            {tier && <span className="badge status-active">{tier} · {cases_90d} cs/90d</span>}
            {a.licence_sale_no && <span className="badge">LSL {a.licence_sale_no}</span>}
            {agco_licence && (
              <span className="badge flex items-center gap-1">
                <BadgeCheck size={11} /> AGCO {agco_licence.status}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {a.phone && (
            <a href={`tel:${a.phone.replace(/[^0-9+]/g, '')}`} className="h-11 px-4 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-fg)] text-sm font-medium flex items-center gap-2">
              <Phone size={15} /> Call
            </a>
          )}
          <a href={a.google_maps_url} target="_blank" rel="noreferrer" className="h-11 px-4 rounded-lg border text-sm font-medium flex items-center gap-2">
            <MapPin size={15} /> Maps
          </a>
          <a href={a.yelp_url} target="_blank" rel="noreferrer" className="h-11 px-4 rounded-lg border text-sm font-medium flex items-center">
            Yelp
          </a>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Account</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <Row k="Contact" v={[a.contact_name, a.contact_title].filter(Boolean).join(' · ') || '—'} />
            <Row k="Phone" v={a.phone || '—'} />
            <Row k="Email" v={a.email || '—'} />
            <Row k="Rep" v={a.rep_name || '—'} />
            <Row k="Lead SKUs" v={a.products_carried || '—'} />
            <Row k="Scheme" v={a.scheme || '—'} />
            <Row k="Last visit" v={a.last_visit ? formatDate(a.last_visit) : '—'} />
            {a.notes && (
              <div className="pt-2 border-t text-xs whitespace-pre-wrap text-[var(--color-muted)]">{a.notes}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShoppingCart size={16} /> Log an order</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-[var(--color-muted)]">
              The venue orders through the LCBO on its own licence. This records that it happened.
            </p>
            <select value={sku} onChange={(e) => setSku(e.target.value)} className="select w-full">
              <option value="">Pick the SKU…</option>
              {portfolio.data?.items.map((p) => (
                <option key={p.lcbo_num} value={p.sku_name}>{p.sku_name}</option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-2">
              <input value={cases} onChange={(e) => setCases(e.target.value)} inputMode="numeric" placeholder="Cases" className="select" />
              <input value={store} onChange={(e) => setStore(e.target.value)} inputMode="numeric" placeholder="LCBO store #" className="select" />
              <input value={rep} onChange={(e) => setRep(e.target.value)} placeholder="Rep" className="select" />
            </div>
            <input value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} placeholder="Notes (optional)" className="select w-full" />
            <button
              onClick={() => logOrder.mutate()}
              disabled={!sku || logOrder.isPending}
              className="w-full h-11 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-fg)] text-sm font-medium disabled:opacity-50"
            >
              {logOrder.isPending ? 'Saving…' : 'Save order'}
            </button>
            {logOrder.isError && <p className="text-xs text-[var(--color-danger)]">Could not save. Try again.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Order history</CardTitle></CardHeader>
        <CardContent>
          {orders.length === 0 && <p className="text-sm text-[var(--color-muted)]">No orders yet. This is the gap to close.</p>}
          <div className="space-y-2">
            {orders.map((o) => (
              <div key={o.id} className="flex items-start justify-between gap-3 text-sm border-b last:border-0 pb-2">
                <div>
                  <span className="font-medium">{o.sku}</span>
                  {o.notes && <div className="text-xs text-[var(--color-muted)]">{o.notes}</div>}
                </div>
                <div className="text-right text-xs shrink-0">
                  <div>{o.cases ? `${o.cases} cs` : o.units ? `${o.units} btl` : ''}</div>
                  <div className="text-[var(--color-muted)]">{formatDate(o.at)}{o.rep ? ` · ${o.rep}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageSquareText size={16} /> Conversations and visits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr_auto] gap-2">
            <select value={actType} onChange={(e) => setActType(e.target.value)} className="select">
              {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input value={actNotes} onChange={(e) => setActNotes(e.target.value)} placeholder="What was said, what is next…" className="select" />
            <button
              onClick={() => logActivity.mutate()}
              disabled={!actNotes || logActivity.isPending}
              className="h-11 px-4 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-fg)] text-sm font-medium disabled:opacity-50"
            >
              Log
            </button>
          </div>
          <div className="space-y-2">
            {activities.map((x) => (
              <div key={x.id} className="text-sm border-b last:border-0 pb-2">
                <span className="badge mr-2">{x.activity_type}</span>
                {x.notes}
                <div className="text-xs text-[var(--color-muted)] mt-0.5">{formatDate(x.at)}{x.rep ? ` · ${x.rep}` : ''}</div>
              </div>
            ))}
            {activities.length === 0 && <p className="text-sm text-[var(--color-muted)]">No touches logged yet.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[var(--color-muted)]">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
