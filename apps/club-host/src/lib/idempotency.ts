// Webhook idempotency store. Processors redeliver; the engine hands us a stable
// event id (SquareProvider.webhookEventId / Stripe's event.id) and we skip ids
// we've already processed.
//
// v1 default: in-memory, sufficient for a single-instance launch-tier deploy
// (one long-lived server process per club). If a club scales to multiple
// instances or serverless-per-request, swap InMemoryIdempotencyStore for a
// shared KV/DB implementation of the same interface — nothing else changes.

export interface IdempotencyStore {
  /** True if this event id was already processed. */
  seen(id: string): Promise<boolean>;
  /** Record an event id as processed. */
  markSeen(id: string): Promise<void>;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly ids = new Set<string>();
  private readonly order: string[] = [];
  private readonly max: number;

  constructor(max = 10_000) {
    this.max = max;
  }

  async seen(id: string): Promise<boolean> {
    return this.ids.has(id);
  }

  async markSeen(id: string): Promise<void> {
    if (this.ids.has(id)) return;
    this.ids.add(id);
    this.order.push(id);
    // Bound memory: evict oldest once over cap.
    if (this.order.length > this.max) {
      const oldest = this.order.shift();
      if (oldest !== undefined) this.ids.delete(oldest);
    }
  }
}

// One process-wide store for the active deploy.
export const idempotencyStore: IdempotencyStore = new InMemoryIdempotencyStore();
