import { Env } from './types';

interface JWK {
  kty: string; n: string; e: string; kid: string; alg: string;
}

interface JWKS { keys: JWK[]; }

interface TokenPayload {
  sub: string;
  nickname?: string;
  'https://motobingo.app/roles'?: string[];
  aud: string | string[];
  iss: string;
  exp: number;
  [key: string]: unknown;
}

let cachedJwks: { keys: JWK[]; fetchedAt: number } | null = null;

async function getJwks(domain: string): Promise<JWK[]> {
  if (cachedJwks && Date.now() - cachedJwks.fetchedAt < 3600000) return cachedJwks.keys;
  const res = await fetch(`https://${domain}/.well-known/jwks.json`);
  const jwks = await res.json() as JWKS;
  cachedJwks = { keys: jwks.keys, fetchedAt: Date.now() };
  return jwks.keys;
}

function base64UrlToArrayBuffer(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  const binary = atob(padded);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

async function importKey(jwk: JWK): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

export async function verifyAuth0Token(token: string, env: Env): Promise<TokenPayload | null> {
  try {
    const [headerB64, payloadB64, sigB64] = token.split('.');
    if (!headerB64 || !payloadB64 || !sigB64) return null;

    const header = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')));
    const keys = await getJwks(env.AUTH0_DOMAIN);
    const jwk = keys.find(k => k.kid === header.kid);
    if (!jwk) return null;

    const key = await importKey(jwk);
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const sig = new Uint8Array(base64UrlToArrayBuffer(sigB64));
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data);
    if (!valid) return null;

    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))) as TokenPayload;

    // Validate expiry
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    // Validate issuer
    if (payload.iss !== `https://${env.AUTH0_DOMAIN}/`) return null;
    // Validate audience
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.AUTH0_AUDIENCE)) return null;

    return payload;
  } catch {
    return null;
  }
}

export function getTokenFromRequest(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

export async function requireAuth(request: Request, env: Env): Promise<TokenPayload | null> {
  // Dev bypass: accept X-Dev-User header in local dev
  if (env.DEV_BYPASS_AUTH === 'true') {
    const devUser = request.headers.get('X-Dev-User');
    if (devUser) {
      const devRole = request.headers.get('X-Dev-Role');
      return {
        sub: `dev|${devUser}`,
        nickname: devUser,
        'https://motobingo.app/screen_name': devUser,
        'https://motobingo.app/roles': devRole ? [devRole] : [],
        aud: env.AUTH0_AUDIENCE || '',
        iss: `https://${env.AUTH0_DOMAIN || 'dev'}/`,
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
    }
  }

  const token = getTokenFromRequest(request);
  if (!token) return null;
  return verifyAuth0Token(token, env);
}

export async function requireAdmin(request: Request, env: Env): Promise<boolean> {
  // Dev bypass: X-Dev-Role: admin
  if (env.DEV_BYPASS_AUTH === 'true') {
    const devRole = request.headers.get('X-Dev-Role');
    if (devRole === 'admin') return true;
  }

  const payload = await requireAuth(request, env);
  if (!payload) return false;
  const roles: string[] = payload['https://motobingo.app/roles'] || [];
  return roles.includes('admin');
}
