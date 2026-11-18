import 'server-only';

/**
 * Server-side client for the ideation review API (NestJS app). All calls run on
 * the Next.js server, so the browser never talks to the ideation app directly
 * and there is no CORS to configure. The base URL is set by IDEATION_API_URL.
 */
const BASE = process.env.IDEATION_API_URL ?? 'http://localhost:3001';

async function call(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    // The review queue changes as the operator works; never cache it.
    cache: 'no-store',
  });
}

/** GET the DRAFT review queue (best hook first), with receipts + flags. */
export async function getQueue(): Promise<unknown[]> {
  const res = await call('/review/queue');
  if (!res.ok) throw new Error(`Review API returned ${res.status}`);
  return res.json();
}

/** GET the approved scripts serialized as the export contract. */
export async function getApproved(): Promise<unknown> {
  const res = await call('/review/approved');
  if (!res.ok) throw new Error(`Review API returned ${res.status}`);
  return res.json();
}

/** GET any JSON endpoint on the ideation API (e.g. /metrics/*). */
export async function getJson(path: string): Promise<unknown> {
  const res = await call(path);
  if (!res.ok) throw new Error(`Ideation API returned ${res.status}`);
  return res.json();
}

/** Forward a mutation (approve / edit / reject / metrics) to the ideation API. */
export async function forward(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<Response> {
  return call(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
