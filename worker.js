const STREAMLABS_DONATIONS_URL = 'https://streamlabs.com/api/v1.0/donations';
const MAX_PAGES = 60;
const PAGE_LIMIT = 100;
const CACHE_TTL_SECONDS = 120;

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
  } catch (_error) {
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

    const response = await fetch(apiUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    if (!response.ok) {
      throw new Error('Streamlabs API request failed with status ' + response.status);
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
