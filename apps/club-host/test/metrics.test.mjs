// Owner metrics + CSV — pure functions over MemberRecord[], processor-blind.

import assert from 'node:assert/strict';
import test from 'node:test';
import { computeMetrics, monthlyCents, toCsv, needsAttention } from '../src/lib/metrics.ts';

const NOW = new Date('2026-07-03T00:00:00Z');

function daysAgo(n) {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

const members = [
  { customerId: 'C1', email: 'a@x.com', tier: 'club-2', status: 'active', priceCents: 4000, createdAt: daysAgo(10), canceledAt: null },
  { customerId: 'C2', email: 'b@x.com', tier: 'club-4', status: 'active', priceCents: 6500, createdAt: daysAgo(45), canceledAt: null },
  { customerId: 'C3', email: 'c@x.com', tier: 'club-2', status: 'paused', priceCents: 4000, createdAt: daysAgo(80), canceledAt: null },
  { customerId: 'C4', email: 'd@x.com', tier: 'club-2', status: 'canceled', priceCents: 4000, createdAt: daysAgo(120), canceledAt: daysAgo(15) },
];

test('MRR sums active members; counts by status', () => {
  const m = computeMetrics(members, 'monthly', NOW);
  assert.equal(m.activeCount, 2);
  assert.equal(m.pausedCount, 1);
  assert.equal(m.canceledCount, 1);
  assert.equal(m.mrrCents, 4000 + 6500); // paused/canceled excluded
});

test('cadence normalizes to monthly MRR', () => {
  assert.equal(monthlyCents(4000, 'monthly'), 4000);
  assert.equal(monthlyCents(6000, 'quarterly'), 2000);
  assert.equal(monthlyCents(1200, 'weekly'), Math.round((1200 * 52) / 12));
});

test('30/60/90 windows count joins and cancels', () => {
  const m = computeMetrics(members, 'monthly', NOW);
  const w30 = m.windows.find((w) => w.days === 30);
  const w60 = m.windows.find((w) => w.days === 60);
  assert.equal(w30.joined, 1); // C1 (10d)
  assert.equal(w30.canceled, 1); // C4 canceled 15d ago
  assert.equal(w30.net, 0);
  assert.equal(w60.joined, 2); // C1 (10d) + C2 (45d)
});

test('needsAttention = paused + recently canceled', () => {
  const a = needsAttention(members, NOW).map((m) => m.customerId).sort();
  assert.deepEqual(a, ['C3', 'C4']); // paused + canceled-15d
});

test('toCsv escapes and includes a header + one row per member', () => {
  const csv = toCsv([{ customerId: 'C1', email: 'a,b@x.com', tier: 'club-2', status: 'active', priceCents: 4000, createdAt: '2026-06-01T00:00:00Z', canceledAt: null }]);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], 'email,tier,status,price_cents,created_at,canceled_at');
  assert.ok(lines[1].startsWith('"a,b@x.com"'), 'comma-containing email is quoted');
});
