'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, MapPin, Phone, Plus, Search } from 'lucide-react';
import { api, VenueSearchRow } from '@/lib/api';

/**
 * QUICK ADD — the rep types a venue name while logging. Live recommendations
 * come from our own universe (book accounts, 18k AGCO licensees, mapped
 * venues) plus a live address geocode. Picking a licensee/venue prefills the
 * form; picking an existing account jumps straight to it; nothing matching
 * means two taps to create the account anyway. Nobody is ever blocked on
 * "it did not autopopulate".
 */

const REPS = ['Ikshit', 'Vaneet', 'Ed', 'Namit'];
const TYPES = ['restaurant', 'bar', 'hotel', 'banquet hall', 'catering', 'club', 'other'];

export function QuickAddAccount({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<VenueSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', city: '', phone: '', rep: '', account_type: 'restaurant' });
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setRows([]); return; }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await api.venueSearch(q.trim());
        setRows(res.rows);
      } catch { setRows([]); }
      setSearching(false);
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  const pick = (r: VenueSearchRow) => {
    if (r.kind === 'account' && r.account_id) {
      router.push(`/horeca/${r.account_id}`);
      onDone?.();
      return;
    }
    setForm((f) => ({
      ...f,
      name: r.kind === 'address' ? f.name || q : r.name,
      address: r.address || f.address,
      city: r.city || f.city,
      phone: r.phone || f.phone,
    }));
    setShowForm(true);
  };

  const submit = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api.quickAdd({
        name: form.name.trim(),
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        phone: form.phone.trim() || undefined,
        rep: form.rep || undefined,
        account_type: form.account_type,
      });
      qc.invalidateQueries({ queryKey: ['horeca'] });
      router.push(`/horeca/${res.account_id}`);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="flex items-center gap-2">
          {searching ? (
            <Loader2 size={15} className="animate-spin text-[var(--color-muted)] shrink-0" />
          ) : (
            <Search size={15} className="text-[var(--color-muted)] shrink-0" />
          )}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type the venue name or address…"
            className="select w-full"
            autoFocus
          />
        </div>
        {rows.length > 0 && (
          <div className="mt-2 rounded-lg border divide-y max-h-72 overflow-y-auto bg-[var(--color-card)]">
            {rows.map((r, i) => (
              <button
                key={`${r.kind}-${r.licence_number || r.account_id || r.name}-${i}`}
                onClick={() => pick(r)}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-[var(--color-card-border)]/30"
              >
                <span className="font-medium">{r.name}</span>
                <span className="badge ml-2">
                  {r.kind === 'account' ? 'in your book' :
                   r.kind === 'licensee' ? 'AGCO licensed' :
                   r.kind === 'venue' ? 'on the map' : 'new address'}
                </span>
                <div className="text-[11px] text-[var(--color-muted)] flex items-center gap-2 mt-0.5">
                  {(r.address || r.city) && (
                    <span className="flex items-center gap-1">
                      <MapPin size={10} />
                      {[r.address, r.city].filter(Boolean).join(', ')}
                    </span>
                  )}
                  {r.phone && <span className="flex items-center gap-1"><Phone size={10} />{r.phone}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {!showForm ? (
        <button
          onClick={() => { setForm((f) => ({ ...f, name: f.name || q })); setShowForm(true); }}
          className="flex items-center gap-2 h-11 px-4 rounded-lg border text-sm font-medium"
        >
          <Plus size={15} /> Not listed? Add it as a new account
        </button>
      ) : (
        <div className="rounded-lg border p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <L label="Venue name *">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="select" />
            </L>
            <L label="Type">
              <select value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })} className="select">
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </L>
            <L label="Address">
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="select" placeholder="Street address" />
            </L>
            <L label="City">
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="select" />
            </L>
            <L label="Phone">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="select" inputMode="tel" />
            </L>
            <L label="Rep">
              <select value={form.rep} onChange={(e) => setForm({ ...form, rep: e.target.value })} className="select">
                <option value="">Unassigned</option>
                {REPS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </L>
          </div>
          {error && <p className="text-sm text-[var(--color-primary)]">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={saving}
              className="flex items-center gap-2 h-11 px-4 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium disabled:opacity-60"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              Create account
            </button>
            <button onClick={() => setShowForm(false)} className="h-11 px-4 rounded-lg border text-sm">
              Back to search
            </button>
          </div>
          <p className="text-[11px] text-[var(--color-muted)]">
            If the name matches an AGCO licence, the address, phone, and licence
            number attach automatically. A typed address is geocoded so the
            account lands on the map and in day routes.
          </p>
        </div>
      )}
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-medium">{label}</span>
      {children}
    </label>
  );
}
