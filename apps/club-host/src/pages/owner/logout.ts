// GET /owner/logout — clear the owner cookie and return to sign-in.

import type { APIRoute } from 'astro';
import { OWNER_COOKIE } from '../../lib/owner-auth.js';

export const prerender = false;

export const GET: APIRoute = async ({ cookies, redirect }) => {
  cookies.delete(OWNER_COOKIE, { path: '/' });
  return redirect('/owner/login', 302);
};
