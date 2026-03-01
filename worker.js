const STREAMLABS_API_BASE = 'https://streamlabs.com/api/v2.0';
const STREAMLABS_AUTHORIZE_URL = STREAMLABS_API_BASE + '/authorize';
const STREAMLABS_TOKEN_URL = STREAMLABS_API_BASE + '/token';
const STREAMLABS_DONATIONS_URL = STREAMLABS_API_BASE + '/donations';
const STREAMLABS_USER_URL = STREAMLABS_API_BASE + '/user';

const OAUTH_STATE_PREFIX = 'streamlabs:oauth-state:';
const STREAMLABS_TOKEN_KEY = 'streamlabs:token';

const MAX_PAGES = 60;
const PAGE_LIMIT = 100;
const CACHE_TTL_SECONDS = 120;
const OAUTH_STATE_TTL_SECONDS = 600;
const STREAMLABS_TIMEOUT_MS = 15000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === '/api/streamlabs/total') {
      return handleStreamlabsTotal(request, env, ctx);
    }

    if (pathname === '/api/streamlabs/status') {
      return handleStreamlabsStatus(request, env);
    }

    if (pathname === '/streamlabs/connect') {
      return handleStreamlabsConnect(request, env);
    }

    if (pathname === '/streamlabs/callback') {
      return handleStreamlabsCallback(request, env);
    }

    if (pathname === '/streamlabs/disconnect') {
      return handleStreamlabsDisconnect(request, env);
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

async function handleStreamlabsConnect(request, env) {
  if (request.method !== 'GET') {
    return methodNotAllowed('GET');
  }

  const kv = getKvBinding(env);
  if (!kv) {
    return jsonResponse(
      {
        error: 'KV binding missing',
        message: 'Add KV binding STREAMLABS_KV before using /streamlabs/connect.'
      },
      503
    );
  }

  const clientId = String(env.STREAMLABS_CLIENT_ID || '').trim();
  if (!clientId) {
    return jsonResponse(
      {
        error: 'Missing client id',
        message: 'Set STREAMLABS_CLIENT_ID in your Worker vars.'
      },
      503
    );
  }

  const redirectUri = getRedirectUri(request, env);
  const scopes = String(env.STREAMLABS_SCOPES || 'donations.read').trim();
  const state = createStateToken();

  await kv.put(OAUTH_STATE_PREFIX + state, JSON.stringify({ createdAt: Date.now() }), {
    expirationTtl: OAUTH_STATE_TTL_SECONDS
  });

  const authorizeUrl = new URL(STREAMLABS_AUTHORIZE_URL);
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', scopes);
  authorizeUrl.searchParams.set('state', state);

  return Response.redirect(authorizeUrl.toString(), 302);
}

async function handleStreamlabsCallback(request, env) {
  if (request.method !== 'GET') {
    return methodNotAllowed('GET');
  }

  const kv = getKvBinding(env);
  if (!kv) {
    return htmlResponse(
      'Streamlabs OAuth failed',
      '<p>KV binding <code>STREAMLABS_KV</code> is required before connecting.</p>',
      503
    );
  }

  const url = new URL(request.url);
  const errorText = String(url.searchParams.get('error') || '').trim();
  if (errorText) {
    const description = String(url.searchParams.get('error_description') || '').trim();
    return htmlResponse(
      'Streamlabs OAuth declined',
      '<p>Authorization returned: <strong>' +
        escapeHtml(errorText) +
        '</strong></p><p>' +
        escapeHtml(description || 'No description provided.') +
        '</p>',
      400
    );
  }

  const code = String(url.searchParams.get('code') || '').trim();
  const state = String(url.searchParams.get('state') || '').trim();
  if (!code || !state) {
    return htmlResponse(
      'Streamlabs OAuth failed',
      '<p>Missing <code>code</code> or <code>state</code> in callback URL.</p>',
      400
    );
  }

  const stateKey = OAUTH_STATE_PREFIX + state;
  const stateValue = await kv.get(stateKey);
  if (!stateValue) {
    return htmlResponse(
      'Streamlabs OAuth failed',
      '<p>Invalid or expired OAuth state. Start again from <a href="/streamlabs/connect">/streamlabs/connect</a>.</p>',
      400
    );
  }
  await kv.delete(stateKey);

  const credentials = getClientCredentials(env);
  if (!credentials.clientId || !credentials.clientSecret) {
    return htmlResponse(
      'Streamlabs OAuth failed',
      '<p>Set <code>STREAMLABS_CLIENT_ID</code> and <code>STREAMLABS_CLIENT_SECRET</code> in Worker vars/secrets.</p>',
      503
    );
  }

  const redirectUri = getRedirectUri(request, env);
  let tokenPayload;

  try {
    tokenPayload = await exchangeAuthorizationCode(
      code,
      redirectUri,
      credentials.clientId,
      credentials.clientSecret
    );
  } catch (error) {
    const detail = error instanceof StreamlabsApiError ? error.message : String(error && error.message);
    return htmlResponse(
      'Streamlabs OAuth failed',
      '<p>Token exchange failed: ' + escapeHtml(detail || 'Unknown error') + '</p>',
      502
    );
  }

  const accessToken = sanitizeAccessToken(tokenPayload.access_token);
  const refreshToken = sanitizeAccessToken(tokenPayload.refresh_token);
  const expiresAt = toExpiresAt(tokenPayload.expires_in);
  if (!accessToken) {
    return htmlResponse(
      'Streamlabs OAuth failed',
      '<p>Token exchange succeeded but no usable access token was returned.</p>',
      502
    );
  }

  let profile;
  try {
    profile = await fetchAuthenticatedProfile(accessToken);
  } catch (error) {
    const detail = error instanceof StreamlabsApiError ? error.message : String(error && error.message);
    return htmlResponse(
      'Streamlabs OAuth failed',
      '<p>Profile verification failed: ' + escapeHtml(detail || 'Unknown error') + '</p>',
      502
    );
  }

  const expectedUsername = getExpectedUsername(env);
  const actualUsername = chooseAccountUsername(profile.usernames);

  if (expectedUsername && actualUsername && actualUsername !== expectedUsername) {
    return htmlResponse(
      'Wrong Streamlabs account',
      '<p>Connected account <strong>' +
        escapeHtml(actualUsername) +
        '</strong> does not match expected <strong>' +
        escapeHtml(expectedUsername) +
        '</strong>.</p><p>Sign in as the expected account and connect again.</p>',
      403
    );
  }

  const tokenRecord = {
    accessToken,
    refreshToken: refreshToken || null,
    expiresAt: expiresAt,
    scope: String(tokenPayload.scope || env.STREAMLABS_SCOPES || '').trim() || null,
    tokenType: String(tokenPayload.token_type || '').trim() || null,
    accountUsername: actualUsername || null,
    accountVerified: Boolean(expectedUsername && actualUsername && actualUsername === expectedUsername),
    connectedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await kv.put(STREAMLABS_TOKEN_KEY, JSON.stringify(tokenRecord));

  const verificationNote =
    expectedUsername && !tokenRecord.accountVerified
      ? '<p><em>Warning:</em> account username could not be strongly verified from profile payload. Expected <code>' +
        escapeHtml(expectedUsername) +
        '</code>.</p>'
      : '';

  return htmlResponse(
    'Streamlabs connected',
    '<p>Connection saved successfully.</p>' +
      '<p>Account: <strong>' +
      escapeHtml(tokenRecord.accountUsername || expectedUsername || 'unknown') +
      '</strong></p>' +
      verificationNote +
      '<p><a href="/api/streamlabs/total">Test donations endpoint</a></p>' +
      '<p><a href="/">Back to home page</a></p>'
  );
}

async function handleStreamlabsDisconnect(request, env) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return methodNotAllowed('GET, POST');
  }

  const kv = getKvBinding(env);
  if (kv) {
    await kv.delete(STREAMLABS_TOKEN_KEY);
  }

  return jsonResponse({
    ok: true,
    message: 'Stored Streamlabs token removed.'
  });
}

async function handleStreamlabsStatus(request, env) {
  if (request.method !== 'GET') {
    return methodNotAllowed('GET');
  }

  const kv = getKvBinding(env);
  const tokenRecord = await loadStoredToken(env, kv);

  return jsonResponse({
    connected: Boolean(tokenRecord && tokenRecord.accessToken),
    tokenSource: tokenRecord ? tokenRecord.source : null,
    expectedUsername: getExpectedUsername(env),
    accountUsername: tokenRecord ? tokenRecord.accountUsername || null : null,
    hasRefreshToken: Boolean(tokenRecord && tokenRecord.refreshToken),
    expiresAt: tokenRecord ? tokenRecord.expiresAt || null : null,
    connectedAt: tokenRecord ? tokenRecord.connectedAt || null : null,
    redirectUri: String(env.STREAMLABS_REDIRECT_URI || '').trim() || null,
    hasKvBinding: Boolean(kv)
  });
}

async function handleStreamlabsTotal(request, env, ctx) {
  if (request.method !== 'GET') {
    return methodNotAllowed('GET');
  }

  const cacheKeyUrl = new URL(request.url);
  cacheKeyUrl.search = '';
  const cacheKey = new Request(cacheKeyUrl.toString(), request);
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  const kv = getKvBinding(env);
  let tokenRecord = await loadStoredToken(env, kv);
  if (!tokenRecord || !tokenRecord.accessToken) {
    return jsonResponse(
      {
        error: 'Not connected',
        message:
          'No Streamlabs token available. Visit /streamlabs/connect to authorize and store one.'
      },
      503,
      { 'Cache-Control': 'no-store' }
    );
  }

  try {
    let summary = await fetchStreamlabsDonationSummary(tokenRecord.accessToken);

    if (tokenRecord.accountUsername) {
      summary.accountUsername = tokenRecord.accountUsername;
    }

    const response = jsonResponse(summary, 200, {
      'Cache-Control': 'public, max-age=' + CACHE_TTL_SECONDS
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    const credentials = getClientCredentials(env);
    const canRefresh =
      error instanceof StreamlabsApiError &&
      error.status === 401 &&
      Boolean(tokenRecord.refreshToken && credentials.clientId && credentials.clientSecret && kv);

    if (canRefresh) {
      try {
        tokenRecord = await refreshStoredAccessToken(tokenRecord, credentials, kv, env);
        const refreshedSummary = await fetchStreamlabsDonationSummary(tokenRecord.accessToken);
        if (tokenRecord.accountUsername) {
          refreshedSummary.accountUsername = tokenRecord.accountUsername;
        }

        const refreshedResponse = jsonResponse(refreshedSummary, 200, {
          'Cache-Control': 'public, max-age=' + CACHE_TTL_SECONDS
        });
        ctx.waitUntil(cache.put(cacheKey, refreshedResponse.clone()));
        return refreshedResponse;
      } catch (refreshError) {
        const parsedRefreshError =
          refreshError instanceof StreamlabsApiError
            ? refreshError
            : new StreamlabsApiError(502, String(refreshError && refreshError.message));

        return jsonResponse(
          {
            error: 'Streamlabs API error',
            upstreamStatus: parsedRefreshError.status,
            message: parsedRefreshError.message
          },
          502,
          { 'Cache-Control': 'no-store' }
        );
      }
    }

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
      {
        error: 'Failed to fetch Streamlabs totals',
        message: String((error && error.message) || 'Unknown runtime error'),
        errorType: String((error && error.name) || 'Error')
      },
      502,
      { 'Cache-Control': 'no-store' }
    );
  }
}

async function fetchStreamlabsDonationSummary(accessToken) {
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

    const response = await fetchStreamlabs(apiUrl.toString(), accessToken);
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

async function fetchAuthenticatedProfile(accessToken) {
  const response = await fetchStreamlabs(STREAMLABS_USER_URL, accessToken);
  if (!response.ok) {
    throw await parseStreamlabsError(response);
  }

  const payload = await response.json();
  return {
    payload,
    usernames: extractPossibleUsernames(payload)
  };
}

async function exchangeAuthorizationCode(code, redirectUri, clientId, clientSecret) {
  const body = {
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code: code
  };

  const response = await fetchWithTimeout(STREAMLABS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw await parseStreamlabsError(response);
  }

  return response.json();
}

async function refreshStoredAccessToken(tokenRecord, credentials, kv, env) {
  const response = await fetchWithTimeout(STREAMLABS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: tokenRecord.refreshToken
    })
  });

  if (!response.ok) {
    throw await parseStreamlabsError(response);
  }

  const payload = await response.json();
  const refreshedAccessToken = sanitizeAccessToken(payload.access_token);
  const refreshedRefreshToken = sanitizeAccessToken(payload.refresh_token || tokenRecord.refreshToken);
  const refreshedTokenRecord = {
    accessToken: refreshedAccessToken || tokenRecord.accessToken,
    refreshToken: refreshedRefreshToken || null,
    expiresAt: toExpiresAt(payload.expires_in),
    scope: String(payload.scope || tokenRecord.scope || '').trim() || null,
    tokenType: String(payload.token_type || tokenRecord.tokenType || '').trim() || null,
    accountUsername: tokenRecord.accountUsername || null,
    accountVerified: Boolean(tokenRecord.accountVerified),
    connectedAt: tokenRecord.connectedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (kv) {
    await kv.put(STREAMLABS_TOKEN_KEY, JSON.stringify(refreshedTokenRecord));
  } else if (!sanitizeAccessToken(env.STREAMLABS_ACCESS_TOKEN)) {
    throw new Error('KV binding missing; refreshed token cannot be persisted.');
  }

  return refreshedTokenRecord;
}

async function loadStoredToken(env, kv) {
  if (kv) {
    const raw = await kv.get(STREAMLABS_TOKEN_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const accessToken = sanitizeAccessToken(parsed.accessToken);
        if (accessToken) {
          return {
            accessToken: accessToken,
            refreshToken: sanitizeAccessToken(parsed.refreshToken),
            expiresAt: parsed.expiresAt || null,
            scope: parsed.scope || null,
            tokenType: parsed.tokenType || null,
            accountUsername: normalizeUsername(parsed.accountUsername),
            accountVerified: Boolean(parsed.accountVerified),
            connectedAt: parsed.connectedAt || null,
            updatedAt: parsed.updatedAt || null,
            source: 'kv'
          };
        }
      } catch (_error) {
        // Ignore malformed KV data and continue to fallback.
      }
    }
  }

  const fallbackAccessToken = sanitizeAccessToken(env.STREAMLABS_ACCESS_TOKEN);
  if (fallbackAccessToken) {
    return {
      accessToken: fallbackAccessToken,
      refreshToken: null,
      expiresAt: null,
      scope: null,
      tokenType: null,
      accountUsername: null,
      accountVerified: false,
      connectedAt: null,
      updatedAt: null,
      source: 'secret'
    };
  }

  return null;
}

function getKvBinding(env) {
  return env && env.STREAMLABS_KV ? env.STREAMLABS_KV : null;
}

function getClientCredentials(env) {
  return {
    clientId: String(env.STREAMLABS_CLIENT_ID || '').trim(),
    clientSecret: String(env.STREAMLABS_CLIENT_SECRET || '').trim()
  };
}

function getRedirectUri(request, env) {
  const configured = String(env.STREAMLABS_REDIRECT_URI || '').trim();
  if (configured) {
    return configured;
  }

  const url = new URL(request.url);
  return url.origin + '/streamlabs/callback';
}

function getExpectedUsername(env) {
  const configured = String(env.STREAMLABS_EXPECTED_USERNAME || 'teamcovey').trim();
  return normalizeUsername(configured);
}

function createStateToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(function (value) {
      return value.toString(16).padStart(2, '0');
    })
    .join('');
}

function extractPossibleUsernames(payload) {
  const candidates = new Set();
  addUsernameCandidate(candidates, payload && payload.username);
  addUsernameCandidate(candidates, payload && payload.name);
  addUsernameCandidate(candidates, payload && payload.display_name);
  addUsernameCandidate(candidates, payload && payload.displayName);

  const userLikeContainers = [
    payload && payload.user,
    payload && payload.streamlabs,
    payload && payload.account,
    payload && payload.channel,
    payload && payload.twitch
  ];

  userLikeContainers.forEach(function (container) {
    if (!container || typeof container !== 'object' || Array.isArray(container)) {
      return;
    }

    addUsernameCandidate(candidates, container.username);
    addUsernameCandidate(candidates, container.name);
    addUsernameCandidate(candidates, container.display_name);
    addUsernameCandidate(candidates, container.displayName);
    addUsernameCandidate(candidates, container.login);
    addUsernameCandidate(candidates, container.slug);
  });

  return Array.from(candidates);
}

function chooseAccountUsername(usernames) {
  if (!Array.isArray(usernames) || !usernames.length) {
    return null;
  }

  for (let i = 0; i < usernames.length; i += 1) {
    const value = normalizeUsername(usernames[i]);
    if (value) {
      return value;
    }
  }

  return null;
}

function addUsernameCandidate(set, value) {
  const normalized = normalizeUsername(value);
  if (normalized) {
    set.add(normalized);
  }
}

function normalizeUsername(value) {
  const text = String(value || '')
    .trim()
    .toLowerCase();
  if (!text) {
    return null;
  }

  return text.replace(/^@+/, '');
}

function toExpiresAt(expiresIn) {
  const seconds = Number.parseInt(String(expiresIn || ''), 10);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return Date.now() + seconds * 1000;
}

function sanitizeAccessToken(rawValue) {
  let token = String(rawValue || '').trim();
  token = token.replace(/^Bearer\s+/i, '');
  token = token.replace(/^['"]+|['"]+$/g, '');
  token = token.replace(/[\u0000-\u001F\u007F]/g, '');
  token = token.replace(/\s+/g, '');
  return token;
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
      // Fall through to plain formatting.
    }
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(total);
}

async function fetchStreamlabs(url, accessToken) {
  return fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });
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
        detailMessage = bodyText.slice(0, 220).trim();
      }
    }
  } catch (_error) {
    // Ignore parse failures.
  }

  const defaultMessage =
    response.status === 401 || response.status === 403
      ? 'Unauthorized. Token may be invalid, expired, or missing required scopes.'
      : 'Upstream request failed.';

  return new StreamlabsApiError(
    response.status,
    'Streamlabs returned ' + response.status + ': ' + (detailMessage || defaultMessage)
  );
}

class StreamlabsApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'StreamlabsApiError';
    this.status = status;
  }
}

function methodNotAllowed(allowValue) {
  return jsonResponse(
    { error: 'Method not allowed' },
    405,
    { Allow: allowValue }
  );
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

function htmlResponse(title, bodyHtml, status) {
  const html =
    '<!doctype html>' +
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' +
    escapeHtml(title) +
    '</title>' +
    '<style>body{font-family:Inter,Segoe UI,system-ui,sans-serif;background:#0b1220;color:#e4ecf6;padding:2rem;line-height:1.6}a{color:#7cc4ff}code{background:#111a2b;padding:.1rem .35rem;border-radius:4px}</style>' +
    '</head><body><h1>' +
    escapeHtml(title) +
    '</h1>' +
    bodyHtml +
    '</body></html>';

  return new Response(html, {
    status: status || 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8'
    }
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
