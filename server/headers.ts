/**
 * Security headers for every response. Most are enforced. The Content-Security-Policy is REPORT-ONLY by default because
 * Google Maps loads scripts, styles and images from several Google hosts and I could not verify them in a real browser;
 * set CSP_MODE=enforce once the browser console shows no violations on the live site.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://maps.googleapis.com https://maps.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://maps.gstatic.com https://maps.googleapis.com https://*.ggpht.com https://images.unsplash.com",
  "connect-src 'self' https://maps.googleapis.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'"
].join('; ');

export function securityHeaders(): Record<string, string> {
  const enforce = process.env.CSP_MODE === 'enforce';
  return {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    [enforce ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only']: CSP
  };
}
