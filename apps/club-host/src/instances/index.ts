// Instance registry + selector. The active client is chosen by the
// CODEC_INSTANCE env var (default: outer-heaven). Adding a client = adding one
// ClubInstance object and one line here — no core or route changes.

import type { ClubInstance } from './types.js';
import { outerHeaven } from './outer-heaven.js';
import { sunset } from './sunset.js';

export const INSTANCES: Record<string, ClubInstance> = {
  [outerHeaven.id]: outerHeaven,
  [sunset.id]: sunset,
};

export function activeInstance(): ClubInstance {
  const id = process.env.CODEC_INSTANCE ?? 'outer-heaven';
  const instance = INSTANCES[id];
  if (!instance) {
    throw new Error(
      `Unknown CODEC_INSTANCE "${id}". Known instances: ${Object.keys(INSTANCES).join(', ')}`,
    );
  }
  return instance;
}

export type { ClubInstance } from './types.js';
