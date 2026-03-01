const STREAMLABS_DONATIONS_URL = 'https://streamlabs.com/api/v2.0/donations';
const MAX_PAGES = 60;
const PAGE_LIMIT = 100;
const CACHE_TTL_SECONDS = 120;
const STREAMLABS_TIMEOUT_MS = 15000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/streamlabs/total') {
      return handleStreamlabsTotal(request, env, ctx);
    }

    return serveAsset(request, env);
  }
};

async function serveAsset(request, env) {
  if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
    return env.ASSETS.fetch(request);
  }

  return new Response('ASSETS binding is unavailable.', { status: 500 });
}

async function handleStreamlabsTotal(request, env, ctx) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405, {
      Allow: 'GET'
    });
  }

  const token = String(env.STREAMLABS_ACCESS_TOKEN || '').trim();
  if (!token) {
    return jsonResponse(
      {
        error: 'Missing Streamlabs token',
        message: 'Set STREAMLABS_ACCESS_TOKEN as a Wrangler secret.'
      },
      503
    );
  }

  const cacheKeyUrl = new URL(request.url);
  cacheKeyUrl.search = '';
  const cacheKey = new Request(cacheKeyUrl.toString(), request);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const summary = await fetchStreamlabsDonationSummary(token);
    const response = jsonResponse(summary, 200, {
      'Cache-Control': 'public, max-age=' + CACHE_TTL_SECONDS
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    if (error instanceof StreamlabsApiError) {
      return jsonResponse(
        {
          error: 'Streamlabs API error',
          upstreamStatus: error.status,
          message: error.message
        },
        502,
        { 'Cache-Control': 'no-store' }
      );
    }

    return jsonResponse(
      { error: 'Failed to fetch Streamlabs totals' },
      502,
      { 'Cache-Control': 'no-store' }
    );
  }
}

async function fetchStreamlabsDonationSummary(token) {
  let before = '';
  let pagesFetched = 0;
  let total = 0;
  const currencyCounts = new Map();

  while (pagesFetched < MAX_PAGES) {
    const apiUrl = new URL(STREAMLABS_DONATIONS_URL);
    apiUrl.searchParams.set('limit', String(PAGE_LIMIT));
    if (before) {
      apiUrl.searchParams.set('before', before);
    }

    const response = await fetchWithTimeout(apiUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    if (!response.ok) {
      throw await parseStreamlabsError(response);
    }

    const payload = await response.json();
    const donations = Array.isArray(payload && payload.data) ? payload.data : [];
    if (!donations.length) {
      break;
    }

    for (const donation of donations) {
      const numericAmount = normalizeAmount(donation && donation.amount);
      if (numericAmount !== null) {
        total += numericAmount;
      }

      const currency = String((donation && donation.currency) || '')
        .trim()
        .toUpperCase();
      if (currency) {
        const count = currencyCounts.get(currency) || 0;
        currencyCounts.set(currency, count + 1);
      }
    }

    if (donations.length < PAGE_LIMIT) {
      break;
    }

    const lastDonation = donations[donations.length - 1];
    const nextBefore = String((lastDonation && lastDonation.donation_id) || '').trim();
    if (!nextBefore || nextBefore === before) {
      break;
    }

    before = nextBefore;
    pagesFetched += 1;
  }

  const roundedTotal = Math.round(total * 100) / 100;
  const primaryCurrency = pickPrimaryCurrency(currencyCounts);

  return {
    total: roundedTotal,
    currency: primaryCurrency,
    formattedTotal: formatTotal(roundedTotal, primaryCurrency),
    fetchedAt: new Date().toISOString()
  };
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timeoutId = setTimeout(function () {
    controller.abort('Streamlabs request timed out');
  }, STREAMLABS_TIMEOUT_MS);

  try {
    return await fetch(url, Object.assign({}, init, { signal: controller.signal }));
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new StreamlabsApiError(504, 'Streamlabs API request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function parseStreamlabsError(response) {
  let detailMessage = '';
  try {
    const bodyText = await response.text();
    if (bodyText) {
      try {
        const json = JSON.parse(bodyText);
        const fromJson =
          json.error_description || json.message || json.error || '';
        detailMessage = String(fromJson || '').trim();
      } catch (_error) {
        detailMessage = bodyText.slice(0, 180).trim();
      }
    }
  } catch (_error) {
    // Ignore parse failures; fall back to status text.
  }

  const defaultMessage =
    response.status === 401 || response.status === 403
      ? 'Token invalid/expired or missing required Streamlabs scopes (donations.read).'
      : 'Upstream request failed.';

  const baseMessage = detailMessage || defaultMessage;
  return new StreamlabsApiError(
    response.status,
    'Streamlabs returned ' + response.status + ': ' + baseMessage
  );
}

class StreamlabsApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'StreamlabsApiError';
    this.status = status;
  }
}

function normalizeAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function pickPrimaryCurrency(currencyCounts) {
  if (!currencyCounts.size) {
    return null;
  }

  let bestCurrency = null;
  let bestCount = -1;
  for (const [currency, count] of currencyCounts.entries()) {
    if (count > bestCount) {
      bestCurrency = currency;
      bestCount = count;
    }
  }

  return bestCurrency;
}

function formatTotal(total, currency) {
  if (currency) {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency
      }).format(total);
    } catch (_error) {
      // Fall through to basic number formatting.
    }
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(total);
}

function jsonResponse(payload, status, extraHeaders) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8'
  });

  if (extraHeaders) {
    Object.keys(extraHeaders).forEach(function (key) {
      headers.set(key, String(extraHeaders[key]));
    });
  }

  return new Response(JSON.stringify(payload), {
    status,
    headers
  });
}
