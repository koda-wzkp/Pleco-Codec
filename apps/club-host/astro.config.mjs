import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';

// SSR host: API routes (webhook, waitlist) + server-rendered club pages.
// The node adapter lets us build/run/verify locally; swap to @astrojs/vercel
// for deployment (one-line change, documented in README).
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  security: {
    // The only HTML form POST is the owner login; its CSRF exposure is nil
    // (an attacker submitting a guessed passcode cross-site gains nothing), and
    // the authenticated /owner area is protected by a SameSite=Lax cookie, which
    // is not sent on cross-site requests. The webhook + waitlist routes are JSON
    // (never covered by this check) and carry their own protection (Square HMAC
    // signature; waitlist honeypot). So the form-origin check adds nothing here
    // while blocking the legitimate login through the node adapter.
    checkOrigin: false,
  },
});
