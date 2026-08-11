'use client';

// Bundled from the package, not a CDN: our CSP is style-src 'self',
// so the unpkg stylesheet this used to inject was blocked and the map
// rendered as a blank box in production.
import 'leaflet/dist/leaflet.css';

import { useEffect, useRef } from 'react';
import type { Store } from '@/lib/api';

/**
 * Leaflet store map. Loaded dynamically (Leaflet accesses window) via next/dynamic.
 */
export default function StoreMap({
  stores,
  colorBy = 'territory',
}: {
  stores: Store[];
  colorBy?: 'territory' | 'default';
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const layerRef = useRef<import('leaflet').LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          preferCanvas: true,
          zoomControl: true,
          attributionControl: false,
        }).setView([43.7, -79.4], 8);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
        }).addTo(mapRef.current);
      }

      if (layerRef.current) {
        layerRef.current.remove();
        layerRef.current = null;
      }

      const grp = L.layerGroup();
      const bounds: [number, number][] = [];
      stores.forEach((s) => {
        if (!s.lat || !s.lng) return;
        bounds.push([s.lat, s.lng]);
        const color =
          colorBy === 'territory' ? s.territory_color || '#9fa8bb' : '#d8ad58';
        const popup = `
          <strong>#${s.store_number} — ${escapeHtml(s.account || '')}</strong><br/>
          ${escapeHtml(s.address || '')}<br/>
          ${escapeHtml(s.city || '')} ${escapeHtml(s.postal || '')}<br/>
          Territory: <span style="color:${color}">${escapeHtml(s.territory_name || 'Unassigned')}</span><br/>
          Rep: ${escapeHtml(s.rep || '—')}
        `;
        L.circleMarker([s.lat, s.lng], {
          radius: 6,
          color,
          fillColor: color,
          fillOpacity: 0.8,
          weight: 1,
        }).bindPopup(popup).addTo(grp);
      });
      if (mapRef.current) {
        grp.addTo(mapRef.current);
        layerRef.current = grp;
        if (bounds.length > 0) {
          try {
            mapRef.current.fitBounds(bounds, { padding: [20, 20] });
          } catch {
            /* ignore */
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stores, colorBy]);

  return <div ref={containerRef} className="h-[min(70vh,600px)] w-full rounded-xl border border-[var(--color-card-border)]" />;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
