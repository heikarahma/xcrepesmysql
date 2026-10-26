const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const SESSION_TOKEN_KEY = 'xcrepes_mysql_session_token';

const apiUrl = (path) => `${API_BASE_URL}${path}`;

export const getSessionToken = () => {
  try { return localStorage.getItem(SESSION_TOKEN_KEY) || ''; } catch { return ''; }
};

export const hasFreshSessionToken = () => {
  const token = getSessionToken();
  if (!token) return false;
  try {
    const [payload] = token.split('.');
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const parsed = JSON.parse(atob(normalized));
    return Number(parsed.exp || 0) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
};

export const setSessionToken = (token) => {
  try {
    if (token) localStorage.setItem(SESSION_TOKEN_KEY, token);
    else localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch { /* private browsing/storage disabled */ }
};

export const clearSessionToken = () => setSessionToken('');

const request = async (path, options = {}) => {
  const token = getSessionToken();
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const result = await response.json().catch(() => ({ error: { message: 'Respons server tidak valid.' } }));
  if (!response.ok && !result.error) result.error = { message: `HTTP ${response.status}` };
  if (response.status === 401) {
    clearSessionToken();
    window.dispatchEvent(new Event('xcrepes:session-expired'));
  }
  return result;
};

export const loginToDatabase = async (username, password) => request('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ username, password })
});

export const apiPost = async (path, body) => request(path, {
  method: 'POST',
  body: JSON.stringify(body)
});


class QueryBuilder {
  constructor(table) {
    this.payload = {
      table,
      operation: 'select',
      filters: [],
      select: { columns: '*' },
      returning: false
    };
    this.promise = null;
  }

  select(columns = '*', options = {}) {
    this.payload.select = { columns: columns || '*', count: options.count || null };
    if (this.payload.operation !== 'select') this.payload.returning = true;
    return this;
  }

  insert(values) {
    this.payload.operation = 'insert';
    this.payload.values = values;
    return this;
  }

  upsert(values, options = {}) {
    this.payload.operation = 'upsert';
    this.payload.values = values;
    this.payload.onConflict = options.onConflict || null;
    return this;
  }

  update(values) {
    this.payload.operation = 'update';
    this.payload.values = values;
    return this;
  }

  delete() {
    this.payload.operation = 'delete';
    return this;
  }

  filter(operator, column, value) {
    this.payload.filters.push({ operator, column, value });
    return this;
  }

  eq(column, value) { return this.filter('eq', column, value); }
  neq(column, value) { return this.filter('neq', column, value); }
  gt(column, value) { return this.filter('gt', column, value); }
  gte(column, value) { return this.filter('gte', column, value); }
  lt(column, value) { return this.filter('lt', column, value); }
  lte(column, value) { return this.filter('lte', column, value); }
  like(column, value) { return this.filter('like', column, value); }
  ilike(column, value) { return this.filter('ilike', column, value); }
  not(column, operator, value) { return this.filter(`not_${operator}`, column, value); }
  in(column, value) { return this.filter('in', column, value); }

  or(expression) {
    this.payload.or = expression;
    return this;
  }

  order(column, { ascending = true } = {}) {
    this.payload.order = { column, ascending };
    return this;
  }

  limit(value) {
    this.payload.limit = value;
    return this;
  }

  range(from, to) {
    this.payload.range = { from, to };
    return this;
  }

  single() {
    this.payload.single = true;
    return this;
  }

  maybeSingle() {
    this.payload.maybeSingle = true;
    return this;
  }

  execute() {
    if (!this.promise) {
      this.promise = request('/api/query', {
        method: 'POST',
        body: JSON.stringify(this.payload)
      }).catch((error) => ({ data: null, count: null, error: { message: error.message, code: 'NETWORK_ERROR' } }));
    }
    return this.promise;
  }

  then(resolve, reject) { return this.execute().then(resolve, reject); }
  catch(reject) { return this.execute().catch(reject); }
  finally(callback) { return this.execute().finally(callback); }
}

export const database = {
  from(table) { return new QueryBuilder(table); }
};

export const isDatabaseConfigured = () => import.meta.env.VITE_USE_LOCAL_DATA !== 'true';

const changeSubscribers = new Map();
const changeSignatures = new Map();
let sharedPollTimer = null;
let sharedPollInFlight = false;

const configuredPollInterval = Number(import.meta.env.VITE_REALTIME_POLL_MS || 120000);
const sharedPollIntervalMs = Number.isFinite(configuredPollInterval)
  ? Math.max(60000, configuredPollInterval)
  : 120000;

const subscriberCount = () => [...changeSubscribers.values()]
  .reduce((total, callbacks) => total + callbacks.size, 0);

const runSharedChangeCheck = async () => {
  if (sharedPollInFlight || document.visibilityState !== 'visible' || subscriberCount() === 0) return;
  const authenticated = hasFreshSessionToken();
  const requestedScope = authenticated ? 'all' : 'store_settings';
  if (!authenticated && !changeSubscribers.has('store_settings')) return;

  sharedPollInFlight = true;
  try {
    const result = await request(`/api/changes?scope=${requestedScope}`, { method: 'GET' });
    if (result?.error) return;
    const signatures = requestedScope === 'all'
      ? result?.data?.signatures
      : { store_settings: result?.data?.signature };

    for (const [scope, nextSignature] of Object.entries(signatures || {})) {
      if (!nextSignature || !changeSubscribers.has(scope)) continue;
      const previousSignature = changeSignatures.get(scope);
      changeSignatures.set(scope, nextSignature);
      if (previousSignature === undefined || previousSignature === nextSignature) continue;
      for (const callback of changeSubscribers.get(scope)) {
        try { callback({ eventType: 'POLL', scope }); } catch (error) { console.warn('Change subscriber failed:', error); }
      }
    }
  } catch (error) {
    console.warn('Shared change polling failed:', error);
  } finally {
    sharedPollInFlight = false;
  }
};

const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') runSharedChangeCheck();
};

const startSharedPolling = () => {
  if (sharedPollTimer !== null) return;
  sharedPollTimer = window.setInterval(runSharedChangeCheck, sharedPollIntervalMs);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  runSharedChangeCheck();
};

const stopSharedPolling = () => {
  if (sharedPollTimer !== null) window.clearInterval(sharedPollTimer);
  sharedPollTimer = null;
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  changeSignatures.clear();
};

export const subscribeToTable = (_table, callback) => {
  if (!isDatabaseConfigured()) return null;
  if (typeof callback !== 'function') return null;
  const callbacks = changeSubscribers.get(_table) || new Set();
  callbacks.add(callback);
  changeSubscribers.set(_table, callbacks);
  startSharedPolling();

  return {
    unsubscribe: () => {
      const current = changeSubscribers.get(_table);
      current?.delete(callback);
      if (current?.size === 0) {
        changeSubscribers.delete(_table);
        changeSignatures.delete(_table);
      }
      if (subscriberCount() === 0) stopSharedPolling();
    }
  };
};
