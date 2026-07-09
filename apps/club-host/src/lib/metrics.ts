// Owner metrics — pure functions over the processor-blind MemberRecord[] the
// adapter returns. No processor knowledge here; the dashboard reads these.

import type { MemberRecord } from 'pleco-codec/billing';
import type { ClubProgram } from 'pleco-codec/billing';

export interface WindowStat {
  days: number;
  joined: number;
  canceled: number;
  net: number;
}

export interface OwnerMetrics {
  activeCount: number;
  pausedCount: number;
  canceledCount: number;
  /** Monthly-normalized recurring revenue from ACTIVE members, in cents. */
  mrrCents: number;
  windows: WindowStat[];
}

/** Normalize a tier price at the program cadence to a monthly figure (cents). */
export function monthlyCents(priceCents: number, cadence: ClubProgram['cadence']): number {
  switch (cadence) {
    case 'weekly':
      return Math.round((priceCents * 52) / 12);
    case 'quarterly':
      return Math.round(priceCents / 3);
    case 'monthly':
    default:
      return priceCents;
  }
}

export function computeMetrics(
  members: MemberRecord[],
  cadence: ClubProgram['cadence'],
  now: Date = new Date(),
  windowDays: number[] = [30, 60, 90],
): OwnerMetrics {
  let activeCount = 0;
  let pausedCount = 0;
  let canceledCount = 0;
  let mrrCents = 0;

  for (const m of members) {
    if (m.status === 'active') {
      activeCount++;
      if (m.priceCents != null) mrrCents += monthlyCents(m.priceCents, cadence);
    } else if (m.status === 'paused') {
      pausedCount++;
    } else if (m.status === 'canceled') {
      canceledCount++;
    }
  }

  const nowMs = now.getTime();
  const windows: WindowStat[] = windowDays.map((days) => {
    const since = nowMs - days * 24 * 60 * 60 * 1000;
    let joined = 0;
    let canceled = 0;
    for (const m of members) {
      if (m.createdAt && Date.parse(m.createdAt) >= since) joined++;
      if (m.canceledAt && Date.parse(m.canceledAt) >= since) canceled++;
    }
    return { days, joined, canceled, net: joined - canceled };
  });

  return { activeCount, pausedCount, canceledCount, mrrCents, windows };
}

export function formatMoney(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Members needing owner attention: paused, or canceled within 30 days. */
export function needsAttention(members: MemberRecord[], now: Date = new Date()): MemberRecord[] {
  const since = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  return members.filter(
    (m) =>
      m.status === 'paused' ||
      (m.status === 'canceled' && m.canceledAt != null && Date.parse(m.canceledAt) >= since),
  );
}

/** CSV export of the member list. Ownership/portability is a core promise. */
export function toCsv(members: MemberRecord[]): string {
  const header = ['email', 'tier', 'status', 'price_cents', 'created_at', 'canceled_at'];
  const rows = members.map((m) =>
    [m.email ?? '', m.tier, m.status, m.priceCents ?? '', m.createdAt ?? '', m.canceledAt ?? '']
      .map(csvCell)
      .join(','),
  );
  return [header.join(','), ...rows].join('\r\n') + '\r\n';
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
