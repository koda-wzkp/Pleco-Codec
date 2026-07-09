// Owner-dashboard auth: a single shared passcode per deploy (OWNER_PASSCODE),
// appropriate for a one-owner shop at launch tier. Stateless — no session store:
// a correct login sets an httpOnly cookie holding a hash of the passcode, and
// middleware admits requests whose cookie matches the configured passcode's
// hash. Rotate by changing OWNER_PASSCODE (invalidates old cookies).
//
// Not a multi-user system. If a club needs per-person owner accounts, that's a
// scoped follow-on (magic-link is sketched in the app README).

import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from './env.js';

export const OWNER_COOKIE = 'haptera_owner';

function hash(passcode: string): string {
  return createHash('sha256').update(passcode).digest('hex');
}

/** The cookie value a valid login should carry (hash of the configured passcode). */
export function expectedToken(): string | null {
  const pass = env('OWNER_PASSCODE');
  return pass ? hash(pass) : null;
}

/** Constant-time check that a submitted passcode matches OWNER_PASSCODE. */
export function passcodeMatches(submitted: string): boolean {
  const pass = env('OWNER_PASSCODE');
  if (!pass) return false;
  const a = Buffer.from(hash(submitted));
  const b = Buffer.from(hash(pass));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Constant-time check that a cookie token authorizes the owner area. */
export function tokenAuthorized(token: string | undefined): boolean {
  const expected = expectedToken();
  if (!expected || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
