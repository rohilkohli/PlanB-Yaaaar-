/** Shared Google Cloud access for server-side REST calls (Firestore): metadata-server token on Cloud Run, test override locally. */
let tokenCache: { token: string; exp: number } | null = null;

export function resetGcpCache() { tokenCache = null; }

export function gcpProject(): string | null {
  return process.env.GOOGLE_CLOUD_PROJECT || process.env.FIRESTORE_PROJECT || null;
}

/** True only on Cloud Run (or when tests inject a token): never try the metadata server on a laptop. */
export function gcpAvailable(): boolean {
  return !!gcpProject() && !!(process.env.K_SERVICE || process.env.FIRESTORE_ACCESS_TOKEN);
}

export async function accessToken(): Promise<string | null> {
  if (process.env.FIRESTORE_ACCESS_TOKEN) return process.env.FIRESTORE_ACCESS_TOKEN;
  if (tokenCache && tokenCache.exp > Date.now() + 30_000) return tokenCache.token;
  try {
    const r = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
      headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(500)
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { access_token: string; expires_in: number };
    tokenCache = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
    return tokenCache.token;
  } catch { return null; }
}
