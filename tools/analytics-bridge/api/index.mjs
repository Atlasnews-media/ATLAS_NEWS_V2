const WEBSITE_ID = 'e34fdb19-91b3-41d5-82ad-a577498b31ca';
const TIMEZONE = 'America/Santiago';
const DEFAULT_BASE = 'https://api.umami.is/v1';
const MAX_DAYS = 31;
const METRIC_TYPES = ['path', 'referrer', 'country', 'device', 'browser', 'os', 'event'];
const EVENT_ALLOWLIST = new Set([
  'article_click',
  'share_click',
  'audio_play',
  'audio_complete',
  'archive_open',
  'subscribe_click',
  'subscribe_success',
  'next_reading_click',
  'outbound_source_click',
]);

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=120');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(body));
}

function getChileDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('date must use YYYY-MM-DD');
  const [year, month, day] = value.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) throw new Error('invalid calendar date');
  return { year, month, day };
}

function shiftDate(value, days) {
  const { year, month, day } = parseDateString(value);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function getOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return asUtc - date.getTime();
}

function localMidnightToUtcMs(value) {
  const { year, month, day } = parseDateString(value);
  const desiredUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = new Date(desiredUtc);
  for (let i = 0; i < 3; i += 1) {
    guess = new Date(desiredUtc - getOffsetMs(guess, TIMEZONE));
  }
  return guess.getTime();
}

function numberize(value) {
  if (Array.isArray(value)) return value.map(numberize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, numberize(v)]));
  }
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function sanitizeMetric(type, rows) {
  if (!Array.isArray(rows)) return [];
  let output = rows;

  if (type === 'path') {
    output = output.filter(row => {
      const name = String(row?.name ?? row?.x ?? '');
      return !name.startsWith('/estado') && !name.startsWith('/lab') && name !== '/status.json';
    });
  }

  if (type === 'event') {
    output = output.filter(row => EVENT_ALLOWLIST.has(String(row?.name ?? row?.x ?? '')));
  }

  if (type === 'referrer') {
    output = output.map(row => {
      const key = Object.hasOwn(row ?? {}, 'name') ? 'name' : 'x';
      if (!String(row?.[key] ?? '').trim()) return { ...row, [key]: 'Direct' };
      return row;
    });
  }

  return output.slice(0, 50);
}

async function umamiGet(path, apiKey) {
  const base = (process.env.UMAMI_API_BASE || DEFAULT_BASE).replace(/\/$/, '');
  const response = await fetch(`${base}${path}`, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${apiKey}`,
      'user-agent': 'ATLAS-Analytics-Bridge/0.1',
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    const text = (await response.text()).slice(0, 300);
    throw new Error(`Umami ${response.status}: ${text || response.statusText}`);
  }
  return numberize(await response.json());
}

function buildQuery(params) {
  const query = new URLSearchParams(params);
  return `?${query.toString()}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  if (req.url === '/api/health' || req.url === '/health') {
    return json(res, 200, {
      ok: true,
      service: 'atlas-analytics-bridge',
      timezone: TIMEZONE,
      websiteId: WEBSITE_ID,
      configured: Boolean(process.env.UMAMI_API_KEY),
    });
  }

  const apiKey = process.env.UMAMI_API_KEY;
  if (!apiKey) return json(res, 503, { ok: false, error: 'umami_api_key_not_configured' });

  try {
    const requestUrl = new URL(req.url, 'https://atlas.invalid');
    const endDate = requestUrl.searchParams.get('date') || getChileDateString();
    parseDateString(endDate);

    const requestedDays = Number(requestUrl.searchParams.get('days') || 1);
    if (!Number.isInteger(requestedDays) || requestedDays < 1 || requestedDays > MAX_DAYS) {
      return json(res, 400, { ok: false, error: `days must be an integer from 1 to ${MAX_DAYS}` });
    }

    const startDate = shiftDate(endDate, -(requestedDays - 1));
    const endExclusiveDate = shiftDate(endDate, 1);
    const startAt = localMidnightToUtcMs(startDate);
    const endAt = localMidnightToUtcMs(endExclusiveDate) - 1;
    const unit = requestedDays <= 2 ? 'hour' : 'day';

    const statsPath = `/websites/${WEBSITE_ID}/stats${buildQuery({ startAt, endAt })}`;
    const seriesPath = `/websites/${WEBSITE_ID}/pageviews${buildQuery({ startAt, endAt, unit, timezone: TIMEZONE })}`;
    const activePath = `/websites/${WEBSITE_ID}/active`;

    const metricPaths = METRIC_TYPES.map(type => ({
      type,
      path: `/websites/${WEBSITE_ID}/metrics/expanded${buildQuery({ startAt, endAt, type, limit: 50 })}`,
    }));

    const [stats, series, active, ...metricResults] = await Promise.all([
      umamiGet(statsPath, apiKey),
      umamiGet(seriesPath, apiKey),
      umamiGet(activePath, apiKey),
      ...metricPaths.map(item => umamiGet(item.path, apiKey)),
    ]);

    const metrics = Object.fromEntries(metricPaths.map((item, index) => [
      item.type,
      sanitizeMetric(item.type, metricResults[index]),
    ]));

    const visits = Number(stats?.visits || 0);
    const pageviews = Number(stats?.pageviews || 0);
    const bounces = Number(stats?.bounces || 0);

    return json(res, 200, {
      ok: true,
      generatedAt: new Date().toISOString(),
      period: {
        timezone: TIMEZONE,
        startDate,
        endDate,
        days: requestedDays,
        startAt,
        endAt,
      },
      summary: {
        visitors: Number(stats?.visitors || 0),
        visits,
        views: pageviews,
        bounces,
        bounceRate: visits ? Number(((bounces / visits) * 100).toFixed(2)) : 0,
        pagesPerVisit: visits ? Number((pageviews / visits).toFixed(2)) : 0,
        totalTime: Number(stats?.totaltime || 0),
        activeVisitors: Number(active?.visitors || 0),
      },
      series,
      top: {
        pages: metrics.path,
        referrers: metrics.referrer,
        countries: metrics.country,
        devices: metrics.device,
        browsers: metrics.browser,
        operatingSystems: metrics.os,
        events: metrics.event,
      },
      privacy: {
        aggregateOnly: true,
        distinctIdExposed: false,
        rawSessionsExposed: false,
        piiExposed: false,
      },
    });
  } catch (error) {
    return json(res, 502, {
      ok: false,
      error: 'upstream_umami_error',
      message: String(error?.message || error).slice(0, 400),
    });
  }
}

export {
  getChileDateString,
  localMidnightToUtcMs,
  sanitizeMetric,
  shiftDate,
};
