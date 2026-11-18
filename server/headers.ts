/**
 * Security headers for every response. The Content-Security-Policy is ENFORCED by default and follows Google's documented
 * CSP for the Maps JavaScript API. Violations are posted to /api/csp-report and land in Cloud Logging as `csp_violation`.
 * Set CSP_MODE=report to fall back to report-only without a code change.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://*.googleapis.com https://*.gstatic.com https://*.google.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.ggpht.com https://images.unsplash.com",
  "connect-src 'self' https://*.googleapis.com https://*.google.com https://*.gstatic.com",
  "worker-src 'self' blob:",
  "frame-src 'self' https://*.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'report-uri /api/csp-report'
].join('; ');

export function securityHeaders(): Record<string, string> {
  const enforce = process.env.CSP_MODE !== 'report';
  return {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(self), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    [enforce ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only']: CSP
  };
}
