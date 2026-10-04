// Signed session cookie (HMAC-SHA256). Uses Web Crypto only, so it works in proxy.ts and route handlers.

export const SESSION_COOKIE = "aja_session";
export const SESSION_DAYS = 30;

const encoder = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(data: string): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET is missing or too short (use 32+ random characters).");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(username: string): Promise<string> {
  const payload = b64url(encoder.encode(JSON.stringify({ u: username, exp: Date.now() + SESSION_DAYS * 86_400_000 })));
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  try {
    if (!safeEqual(sig, await hmac(payload))) return false;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" && json.exp > Date.now() && json.u === process.env.APP_USERNAME;
  } catch {
    return false;
  }
}

/** Constant-time comparison of submitted credentials against APP_USERNAME / APP_PASSWORD. */
export async function credentialsMatch(username: string, password: string): Promise<boolean> {
  const expectedUser = process.env.APP_USERNAME ?? "";
  const expectedPass = process.env.APP_PASSWORD ?? "";
  if (!expectedUser || !expectedPass) throw new Error("APP_USERNAME / APP_PASSWORD are not set.");
  const digest = async (s: string) => b64url(await crypto.subtle.digest("SHA-256", encoder.encode(s)));
  const [a, b, c, d] = await Promise.all([digest(username), digest(expectedUser), digest(password), digest(expectedPass)]);
  return safeEqual(a, b) && safeEqual(c, d);
}
