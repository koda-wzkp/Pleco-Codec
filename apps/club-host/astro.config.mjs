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
});
