// Shared test helpers: a tiny fetch mock (zero deps, node:test only).

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
}

export interface FetchMock {
  calls: RecordedCall[];
  restore(): void;
}

/**
 * Replace global fetch with a router: `routes` maps a substring of the URL
 * to a response body (or a function producing one). Unmatched URLs throw.
 */
export function mockFetch(
  routes: Record<string, unknown | ((call: RecordedCall) => unknown)>,
  options?: { status?: (call: RecordedCall) => number },
): FetchMock {
  const calls: RecordedCall[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    const method = init?.method ?? "GET";
    const headers = Object.fromEntries(
      Object.entries(init?.headers ?? {}).map(([k, v]) => [
        k.toLowerCase(),
        String(v),
      ]),
    );
    const body = init?.body ? parseBody(init.body as string) : undefined;
    const call: RecordedCall = { url, method, headers, body };
    calls.push(call);

    for (const [needle, response] of Object.entries(routes)) {
      if (url.includes(needle)) {
        const payload =
          typeof response === "function" ? (response as any)(call) : response;
        const status = options?.status?.(call) ?? 200;
        return new Response(JSON.stringify(payload ?? {}), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    throw new Error(`mockFetch: unmatched URL ${method} ${url}`);
  }) as typeof fetch;

  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

/**
 * Parse a recorded request body: JSON (Square/Resend) or form-encoded
 * (Stripe) into a plain object. Form keys keep their bracket notation, e.g.
 * `line_items[0][price]`.
 */
function parseBody(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    const out: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(raw)) out[k] = v;
    return out;
  }
}
