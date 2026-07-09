// Gate the /owner area behind the shared passcode. Everything else (the public
// club page, the API routes) is untouched. /owner/login is the only owner path
// reachable while unauthenticated.

import { defineMiddleware } from 'astro:middleware';
import { OWNER_COOKIE, tokenAuthorized } from './lib/owner-auth.js';

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  const isOwnerArea = path === '/owner' || path.startsWith('/owner/');
  const isLogin = path === '/owner/login';

  if (isOwnerArea && !isLogin) {
    const token = context.cookies.get(OWNER_COOKIE)?.value;
    if (!tokenAuthorized(token)) {
      return context.redirect('/owner/login', 302);
    }
  }
  return next();
});
