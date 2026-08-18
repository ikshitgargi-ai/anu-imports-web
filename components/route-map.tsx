'use client';

// Bundled Leaflet CSS (CSP is style-src 'self'; a CDN link renders blank).
import 'leaflet/dist/leaflet.css';

import { useEffect, useRef } from 'react';
import type { DayRoutePayload } from '@/lib/api';

/**
 * Draws an optimized day: origin, numbered stops in visit order joined by a
 * line, and any on-trade stops. Loaded via next/dynamic (Leaflet needs window).
 */
export default function RouteMap({ plan }: { plan: DayRoutePayload }) {
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
          preferCanvas: false,
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

      const o = plan.origin;
      bounds.push([o.lat, o.lng]);
      L.marker([o.lat, o.lng], { icon: pin(L, 'START', '#1a4ea3') })
        .bindPopup(`<strong>Start</strong><br/>${esc(o.label)}`)
        .addTo(grp);

      // route line: origin -> stops in order -> (back to origin if round trip)
      const line: [number, number][] = [[o.lat, o.lng]];
      plan.stops.forEach((s) => {
        bounds.push([s.lat, s.lng]);
        line.push([s.lat, s.lng]);
        const color = s.gap ? '#16876a' : s.low_stock ? '#b8860b' : '#1a1a3a';
        L.marker([s.lat, s.lng], { icon: pin(L, String(s.seq), color) })
          .bindPopup(
            `<strong>${s.seq}. #${s.store_number}</strong><br/>` +
              `${esc(s.account || '')}<br/>${esc(s.address || '')}, ${esc(s.city || '')}<br/>` +
              `${s.gap ? '<b>Gap — pitch a listing</b><br/>' : ''}` +
              `${s.low_stock ? '<b>Low stock — reorder</b><br/>' : ''}` +
              `Leg ${s.leg_km} km · ${s.cumulative_km} km in`,
          )
          .addTo(grp);
      });
      if (plan.round_trip) line.push([o.lat, o.lng]);
      L.polyline(line, { color: '#d8ad58', weight: 3, opacity: 0.85 }).addTo(grp);

      plan.horeca_stops.forEach((h) => {
        bounds.push([h.lat, h.lng]);
        L.marker([h.lat, h.lng], { icon: pin(L, 'H', '#6a162e') })
          .bindPopup(
            `<strong>${esc(h.name)}</strong> (${esc(h.account_type)})<br/>` +
              `${esc(h.city || '')} · ${h.detour_km} km off route<br/>on-trade`,
          )
          .addTo(grp);
      });

      if (mapRef.current) {
        grp.addTo(mapRef.current);
        layerRef.current = grp;
        if (bounds.length > 0) {
          try {
            mapRef.current.fitBounds(bounds, { padding: [30, 30] });
          } catch {
            /* ignore */
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plan]);

  return <div ref={containerRef} className="w-full h-[380px] rounded-xl overflow-hidden" />;
}

function pin(L: typeof import('leaflet'), label: string, color: string) {
  return L.divIcon({
    className: 'route-pin',
    html:
      `<div style="background:${color};color:#fff;border-radius:9999px;` +
      `min-width:22px;height:22px;display:flex;align-items:center;justify-content:center;` +
      `font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);` +
      `padding:0 4px">${esc(label)}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function esc(s: string) {
  return (s || '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c),
  );
}
