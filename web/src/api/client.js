// Thin API client: token storage, auto-attach, and one-shot refresh on 401.

const ACCESS_KEY = 'chase.access';
const REFRESH_KEY = 'chase.refresh';

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set({ accessToken, refreshToken }) {
    if (accessToken) localStorage.setItem(ACCESS_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function raw(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (auth && tokens.access) headers.authorization = `Bearer ${tokens.access}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data.error || {};
    throw new ApiError(err.message || 'Request failed', {
      status: res.status,
      code: err.code,
      details: err.details,
    });
  }
  return data;
}

async function tryRefresh() {
  if (!tokens.refresh) return false;
  try {
    const data = await raw('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: tokens.refresh },
      auth: false,
    });
    tokens.set(data);
    return true;
  } catch {
    tokens.clear();
    return false;
  }
}

/** Request with automatic refresh-and-retry on a 401. */
export async function api(path, opts = {}) {
  try {
    return await raw(path, opts);
  } catch (err) {
    if (err.status === 401 && opts.auth !== false && (await tryRefresh())) {
      return raw(path, opts);
    }
    throw err;
  }
}

export const auth = {
  register: (body) => api('/auth/register', { method: 'POST', body, auth: false }),
  login: (body) => api('/auth/login', { method: 'POST', body, auth: false }),
  me: () => api('/auth/me'),
  logout: () =>
    api('/auth/logout', { method: 'POST', body: { refreshToken: tokens.refresh }, auth: false }).catch(
      () => {},
    ),
};

export const plan = {
  mine: () => api('/plan'),
  setMilestone: (id, completed) =>
    api(`/plan/milestones/${id}`, { method: 'PATCH', body: { completed } }),
};

export const credit = {
  overview: () => api('/credit'),
  pull: () => api('/credit/pull', { method: 'POST' }),
  item: (id) => api(`/credit/items/${id}`),
  dispute: (id, method = 'online') =>
    api(`/credit/items/${id}/dispute`, { method: 'POST', body: { method } }),
  withdraw: (id) => api(`/credit/disputes/${id}/withdraw`, { method: 'POST' }),
  disputes: () => api('/credit/disputes'),
};

export const money = {
  overview: () => api('/money'),
  link: (publicToken) => api('/money/link', { method: 'POST', body: { publicToken } }),
  sync: () => api('/money/sync', { method: 'POST' }),
  setBudget: (category, monthlyTarget) =>
    api('/money/budgets', { method: 'PUT', body: { category, monthlyTarget } }),
  saveGoal: (goal) => api('/money/savings', { method: 'PUT', body: goal }),
};
