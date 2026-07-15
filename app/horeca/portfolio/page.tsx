'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Wine } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';

export default function HorecaPortfolioPage() {
  const portfolio = useQuery({ queryKey: ['horeca-portfolio'], queryFn: api.horecaPortfolio });

  return (
    <div className="space-y-6">
      <Link href="/horeca" className="text-sm flex items-center gap-1 text-[var(--color-muted)]">
        <ArrowLeft size={14} /> HORECA book
      </Link>
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
          <Wine size={24} className="text-[var(--color-accent)]" />
          Portfolio for the bar
        </h1>
        <p className="text-sm text-[var(--color-muted)]">
          The show-a-buyer view. No prices anywhere: the venue orders through the LCBO
          on its licence at its licensee discount.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {portfolio.data?.items.map((p) => (
          <Card key={p.lcbo_num}>
            <CardContent className="pt-4">
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-accent)] font-medium">
                {p.origin}
              </div>
              <h2 className="font-semibold mt-1">{p.sku_name}</h2>
              <p className="text-sm text-[var(--color-muted)] mt-2">{p.story}</p>
              <div className="text-xs text-[var(--color-muted)] mt-3 flex justify-between">
                <span>LCBO #{p.lcbo_num}</span>
                {p.listing !== 'live' && <span className="badge">{p.listing}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
