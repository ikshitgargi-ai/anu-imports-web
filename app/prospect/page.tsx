'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import {
  Compass,
  Search,
  Loader2,
  MapPin,
  Phone,
  Globe,
  UtensilsCrossed,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  api,
  type ProspectAgcoPayload,
  type ProspectCandidate,
  type ProspectSearchPayload,
} from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { REP_ROSTER } from '@/lib/reps';

/**
 * /prospect — Find New Accounts (HORECA prospecting).
 *
 * City + category chips → POST /api/horeca/prospect/search (Overpass/
 * Nominatim open data on the backend), or the AGCO active liquor-sales-
 * licence CSV via /api/horeca/prospect/agco → candidate cards with per-row
 * checkboxes. Rows already in our HORECA book come back flagged
 * `duplicate` — pre-unchecked + badged. Pick a rep, import the rest as
 * status='prospect' accounts, then work them from /horeca.
 */

const CATEGORIES = ['bar', 'pub', 'restaurant', 'nightclub'] as const;

const SOURCES = [
  { id: 'osm', label: 'OpenStreetMap' },
  { id: 'agco', label: 'AGCO licences' },
] as const;
type SourceId = (typeof SOURCES)[number]['id'];

export default function ProspectPage() {
  const [city, setCity] = useState('');
  const [source, setSource] = useState<SourceId>('osm');
  const [categories, setCategories] = useState<string[]>([...CATEGORIES]);
  const [candidates, setCandidates] = useState<ProspectCandidate[]>([]);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [rep, setRep] = useState('');
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [searchedCity, setSearchedCity] = useState('');

  const search = useMutation({
    mutationFn: (): Promise<ProspectSearchPayload | ProspectAgcoPayload> =>
      source === 'agco'
        ? api.prospectAgco({ city: city.trim(), limit: 300 })
        : api.prospectSearch({ city: city.trim(), categories, limit: 300 }),
    onSuccess: (res) => {
      setCandidates(res.candidates);
      // Duplicates come pre-unchecked; everything new is pre-checked.
      setChecked(res.candidates.map((c) => !c.duplicate));
      setImportedCount(null);
      setSearchedCity(res.city || city.trim());
      if (res.candidates.length === 0) {
        toast.info(
          source === 'agco'
            ? 'No active AGCO licences matched — the city filter is exact (e.g. "Toronto", not "GTA").'
            : 'No candidates found — try another city or fewer category filters.',
        );
      }
    },
    onError: (err: unknown) => toast.error((err as Error).message),
  });

  const imp = useMutation({
    mutationFn: (accounts: ProspectCandidate[]) =>
      api.prospectImport({ accounts, rep: rep || undefined }),
    onSuccess: (res) => {
      setImportedCount(res.imported);
      toast.success(
        `Imported ${res.imported} account${res.imported === 1 ? '' : 's'}` +
          (res.skipped ? ` (${res.skipped} duplicates skipped)` : ''),
      );
      if (res.errors > 0) {
        toast.error(`${res.errors} row${res.errors === 1 ? '' : 's'} failed to import.`);
      }
      // Re-flag imported rows as duplicates so a double-tap can't re-import.
      setCandidates((prev) =>
        prev.map((c, i) =>
          checked[i] && !c.duplicate
            ? { ...c, duplicate: true, duplicate_reason: 'imported just now' }
            : c,
        ),
      );
      setChecked((prev) => prev.map(() => false));
    },
    onError: (err: unknown) => toast.error((err as Error).message),
  });

  function toggleCategory(cat: string) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  const selected = candidates.filter((_, i) => checked[i]);
  const duplicateCount = candidates.filter((c) => c.duplicate).length;

  return (
    <div className="space-y-6 pb-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
          <Compass size={24} className="text-[var(--color-accent)]" />
          Find New Accounts
        </h1>
        <p className="text-sm text-[var(--color-muted)]">
          Pull bars, pubs, restaurants and nightclubs from OpenStreetMap or
          AGCO&apos;s active liquor-licence registry for any Ontario city, then
          import the keepers into the HORECA book as prospects.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Search</CardTitle>
          <CardDescription>
            {source === 'agco'
              ? 'Active AGCO liquor sales licences (official Ontario open-data CSV) — exact city match, licensed venues only.'
              : 'Free open data (Overpass) — results are cached for 24h per city.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!city.trim()) return;
              if (source === 'osm' && categories.length === 0) {
                toast.error('Pick at least one category.');
                return;
              }
              search.mutate();
            }}
            className="space-y-3"
          >
            <Field label="Source">
              <div className="flex flex-wrap gap-2">
                {SOURCES.map((s) => {
                  const active = source === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSource(s.id)}
                      className={`px-4 py-2 rounded-lg font-semibold text-sm ${
                        active
                          ? 'bg-[var(--color-accent)] text-[var(--color-primary-fg)]'
                          : 'bg-[var(--color-card)] border border-[var(--color-card-border)]'
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="City">
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Ottawa, Mississauga, London"
                className="select w-full"
                maxLength={80}
              />
            </Field>
            {source === 'osm' && (
              <Field label="Categories">
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => {
                    const active = categories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => toggleCategory(cat)}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm capitalize ${
                          active
                            ? 'bg-[var(--color-accent)] text-[var(--color-primary-fg)]'
                            : 'bg-[var(--color-card)] border border-[var(--color-card-border)]'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </Field>
            )}
            <Button type="submit" disabled={search.isPending || !city.trim()}>
              {search.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Search size={14} />
              )}
              {search.isPending ? 'Searching…' : 'Find accounts'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {candidates.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <CardTitle>
                  {candidates.length} candidates in {searchedCity}
                </CardTitle>
                <CardDescription>
                  {duplicateCount > 0
                    ? `${duplicateCount} already in the HORECA book (unchecked + badged).`
                    : 'None of these are in the HORECA book yet.'}{' '}
                  Uncheck anything you don&apos;t want, pick a rep, import.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setChecked(candidates.map((c) => !c.duplicate))}
                  className="text-[var(--color-accent)] underline"
                >
                  Select new
                </button>
                <button
                  type="button"
                  onClick={() => setChecked(candidates.map(() => false))}
                  className="text-muted underline"
                >
                  Clear
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="Assign to rep (optional)">
                <select
                  value={rep}
                  onChange={(e) => setRep(e.target.value)}
                  className="select"
                >
                  <option value="">— unassigned —</option>
                  {REP_ROSTER.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex items-end">
                <Button
                  onClick={() => imp.mutate(selected)}
                  disabled={imp.isPending || selected.length === 0}
                  className="w-full"
                >
                  {imp.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <UtensilsCrossed size={14} />
                  )}
                  {imp.isPending
                    ? 'Importing…'
                    : `Import ${selected.length} as prospects`}
                </Button>
              </div>
            </div>

            {importedCount != null && (
              <div className="flex items-start gap-2 text-sm p-3 rounded bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.35)]">
                <CheckCircle2 size={16} className="text-[var(--color-success)] shrink-0 mt-0.5" />
                <span>
                  {importedCount} account{importedCount === 1 ? '' : 's'} imported.{' '}
                  <Link href="/horeca" className="text-[var(--color-accent)] underline font-semibold">
                    Open the HORECA book →
                  </Link>
                </span>
              </div>
            )}

            <div className="space-y-2.5">
              {candidates.map((c, i) => (
                <label
                  key={`${c.osm_id || c.licence_no || c.name}-${i}`}
                  className={`m-card block cursor-pointer ${c.duplicate ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked[i] ?? false}
                      onChange={(e) =>
                        setChecked((prev) => {
                          const next = [...prev];
                          next[i] = e.target.checked;
                          return next;
                        })
                      }
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span className="change-chip change-BASELINE capitalize">
                          {(c.account_type || 'venue').replace(/_/g, ' ')}
                        </span>
                        {c.cuisine && (
                          <span className="change-chip change-NEW_LISTING capitalize">
                            {c.cuisine}
                          </span>
                        )}
                        {c.endorsements && (
                          <span className="change-chip change-NEW_LISTING capitalize">
                            {c.endorsements}
                          </span>
                        )}
                        {c.duplicate && (
                          <span
                            className="change-chip change-DELISTED"
                            title={c.duplicate_reason || 'Already in the HORECA book'}
                          >
                            duplicate
                          </span>
                        )}
                      </div>
                      <div className="font-semibold text-base">{c.name}</div>
                      <div className="text-xs text-muted mt-0.5 flex items-center gap-1">
                        <MapPin size={11} className="shrink-0" />
                        {[c.address, c.city, c.postal].filter(Boolean).join(', ') || '—'}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs">
                        {c.licence_no && (
                          <span className="text-muted">Lic. {c.licence_no}</span>
                        )}
                        {c.phone && (
                          <a
                            href={`tel:${c.phone.replace(/[^0-9+]/g, '')}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[var(--color-accent)] flex items-center gap-0.5"
                          >
                            <Phone size={11} /> {c.phone}
                          </a>
                        )}
                        {c.website && (
                          <a
                            href={c.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[var(--color-accent)] flex items-center gap-0.5 truncate max-w-[180px]"
                          >
                            <Globe size={11} /> site
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {candidates.length === 0 && !search.isPending && (
        <div className="m-card text-center py-8 text-muted text-sm">
          Search a city to pull candidate accounts. Imported prospects land in{' '}
          <Link href="/horeca" className="text-[var(--color-accent)] underline">
            HORECA
          </Link>{' '}
          with status “prospect”.
        </div>
      )}
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
