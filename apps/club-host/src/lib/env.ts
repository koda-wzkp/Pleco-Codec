// Environment access. Secrets live in env vars (never in instance config);
// non-secret wiring (audience id, addresses, venue name) comes from the
// ClubInstance. Missing-but-required secrets fail loudly at call time, not
// silently — a half-configured club is worse than an obvious error.

export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in the deploy ` +
        `environment (see apps/club-host/.env.example).`,
    );
  }
  return v;
}
