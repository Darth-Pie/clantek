/**
 * Shared token crypto for sessions and API tokens. Raw tokens are random bytes
 * shown to the client once; only their SHA-256 is ever stored, so a database
 * dump can't be replayed as a live credential.
 */

export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function sha256Base64url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return base64url(new Uint8Array(digest));
}

/** A fresh random token as a base64url string (default 256 bits). */
export function randomToken(bytes = 32): string {
  const raw = new Uint8Array(bytes);
  crypto.getRandomValues(raw);
  return base64url(raw);
}
