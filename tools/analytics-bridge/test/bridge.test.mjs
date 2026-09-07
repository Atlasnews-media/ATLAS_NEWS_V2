import test from 'node:test';
import assert from 'node:assert/strict';
import { localMidnightToUtcMs, sanitizeMetric, shiftDate } from '../api/index.mjs';

const TZ = 'America/Santiago';

function localParts(ms) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}

test('Chile midnight conversion preserves local calendar boundary', () => {
  for (const date of ['2026-04-15', '2026-09-07', '2026-12-15']) {
    const parts = localParts(localMidnightToUtcMs(date));
    assert.equal(`${parts.year}-${parts.month}-${parts.day}`, date);
    assert.equal(parts.hour, '00');
    assert.equal(parts.minute, '00');
  }
});

test('calendar shifting is DST-independent', () => {
  assert.equal(shiftDate('2026-09-07', -1), '2026-09-06');
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
});

test('sensitive/technical dimensions are excluded', () => {
  assert.deepEqual(
    sanitizeMetric('path', [
      { name: '/', pageviews: 2 },
      { name: '/estado/', pageviews: 1 },
      { name: '/lab/foo', pageviews: 1 },
      { name: '/status.json', pageviews: 1 },
    ]),
    [{ name: '/', pageviews: 2 }],
  );

  assert.deepEqual(
    sanitizeMetric('event', [
      { name: 'article_click', pageviews: 2 },
      { name: 'unexpected_free_text', pageviews: 1 },
    ]),
    [{ name: 'article_click', pageviews: 2 }],
  );
});
