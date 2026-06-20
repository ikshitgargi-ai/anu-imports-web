import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      // Dev builds also allow a local Flask backend (see .env.local /
      // NEXT_PUBLIC_API_BASE); production CSP stays locked to the Render
      // backend. NOTE: if NEXT_PUBLIC_API_BASE ever points elsewhere on
      // Vercel, this connect-src must be updated to match or fetches break.
      "connect-src 'self' https://anu-imports-tracker.onrender.com" +
        (process.env.NODE_ENV !== 'production'
          ? ' http://localhost:5060 http://127.0.0.1:5060'
          : ''),
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
  // Dev-only: proxy API calls to a local Flask backend so the app can run
  // fully offline against local data. Engaged by setting
  // NEXT_PUBLIC_API_BASE= (empty) in .env.local → same-origin /api/* calls
  // land here and get forwarded. Production returns no rewrites.
  async rewrites() {
    if (process.env.NODE_ENV === 'production') return [];
    const target = process.env.LOCAL_API_PROXY || 'http://localhost:5060';
    return [
      { source: '/api/:path*', destination: `${target}/api/:path*` },
      { source: '/healthz', destination: `${target}/healthz` },
    ];
  },
  poweredByHeader: false,
};

export default nextConfig;
