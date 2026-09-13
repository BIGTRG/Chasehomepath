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
  scores: () => api('/credit/scores'),
  recordScores: (body) => api('/credit/scores', { method: 'POST', body }),
};

export const money = {
  overview: () => api('/money'),
  link: (publicToken) => api('/money/link', { method: 'POST', body: { publicToken } }),
  sync: () => api('/money/sync', { method: 'POST' }),
  setBudget: (category, monthlyTarget) =>
    api('/money/budgets', { method: 'PUT', body: { category, monthlyTarget } }),
  saveGoal: (goal) => api('/money/savings', { method: 'PUT', body: goal }),
  budgetProposal: () => api('/money/budget/proposal'),
  budgetSetup: (body) => api('/money/budget/setup', { method: 'POST', body }),
  transactions: () => api('/money/transactions'),
};

export const team = {
  mine: () => api('/team'),
  messages: (threadId) => api(`/team/threads/${threadId}/messages`),
  send: (threadId, body) => api(`/team/threads/${threadId}/messages`, { method: 'POST', body: { body } }),
  rate: (ratedUserId, score) => api('/team/ratings', { method: 'POST', body: { ratedUserId, score } }),
};

export const learn = {
  mine: () => api('/learn'),
  complete: (moduleId) => api(`/learn/${moduleId}/done`, { method: 'POST' }),
};

export const market = {
  listings: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api(`/marketplace/listings${q ? `?${q}` : ''}`);
  },
  plans: () => api('/marketplace/plans'),
  planLots: (planId) => api(`/marketplace/plans/${planId}/lots`),
};

export const intake = {
  mine: () => api('/intake'),
  save: (body) => api('/intake', { method: 'POST', body }),
  checklist: () => api('/intake/checklist'),
  uploadDocument: (body) => api('/intake/documents', { method: 'POST', body }),
  slots: () => api('/intake/slots'),
  book: (body) => api('/intake/appointments', { method: 'POST', body }),
};

export const agent = {
  ask: (question) => api('/agent/ask', { method: 'POST', body: { question } }),
};

export const home = {
  dashboard: () => api('/home'),
  record: (body) => api('/home', { method: 'POST', body }),
  completeTask: (id) => api(`/home/maintenance/${id}/done`, { method: 'POST' }),
};

export const assistance = {
  mine: () => api('/assistance'),
};

export const operator = {
  roster: (params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString();
    return api(`/operator/roster${q ? `?${q}` : ''}`);
  },
  client: (memberId) => api(`/operator/members/${memberId}`),
  capacity: () => api('/operator/capacity'),
  ratings: () => api('/operator/ratings'),
  inventory: (params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString();
    return api(`/operator/inventory${q ? `?${q}` : ''}`);
  },
  retire: (id) => api(`/operator/inventory/${id}/retire`, { method: 'POST' }),
  users: (role) => api(`/operator/users${role ? `?role=${role}` : ''}`),
  patchUser: (id, body) => api(`/operator/users/${id}`, { method: 'PATCH', body }),
  patchStaff: (userId, body) => api(`/operator/team/${userId}`, { method: 'PATCH', body }),
  programs: () => api('/operator/programs'),
};

export const ingest = {
  mls: () => api('/ingest/mls', { method: 'POST' }),
  pending: () => api('/ingest/pending'),
  review: (id, decision) => api(`/ingest/listings/${id}/review`, { method: 'POST', body: { decision } }),
};

export const onboarding = {
  queue: () => api('/onboarding/queue'),
  getCase: (id) => api(`/onboarding/cases/${id}`),
  advance: (stepId, decision) => api(`/onboarding/steps/${stepId}/advance`, { method: 'POST', body: { decision } }),
};

export const partner = {
  profile: () => api('/partner/profile'),
  clients: () => api('/partner/clients'),
  listings: () => api('/partner/listings'),
  publish: (body) => api('/partner/listings', { method: 'POST', body }),
  certify: (licenseType, licenseNumber) =>
    api('/partner/certification', { method: 'POST', body: { licenseType, licenseNumber } }),
};

export const billing = {
  plans: () => api('/billing/plans', { auth: false }),
  me: () => api('/billing/me'),
  subscribe: (body) => api('/billing/subscribe', { method: 'POST', body }),
  cancel: () => api('/billing/cancel', { method: 'POST' }),
  resume: () => api('/billing/resume', { method: 'POST' }),
  changePlan: (planCode) => api('/billing/change-plan', { method: 'POST', body: { planCode } }),
  sessionSlots: () => api('/billing/sessions/slots'),
  bookSession: (body) => api('/billing/sessions', { method: 'POST', body }),
  cancelSession: (id) => api(`/billing/sessions/${id}/cancel`, { method: 'POST' }),
  counseling: () => api('/billing/counseling', { auth: Boolean(tokens.access) }),
  joinGroup: (id, body) => api(`/billing/group-sessions/${id}/join`, { method: 'POST', body }),
  createGroup: (body) => api('/billing/operator/group-sessions', { method: 'POST', body }),
  operatorSummary: () => api('/billing/operator/summary'),
  reporting: () => api('/billing/reporting'),
  reportingOptIn: (optIn) => api('/billing/reporting/opt-in', { method: 'POST', body: { optIn } }),
  readiness: () => api('/billing/readiness'),
  operatorReadiness: (memberId) => api(`/billing/operator/members/${memberId}/readiness`),
  operatorReporting: () => api('/billing/operator/reporting'),
  operatorMember: (memberId) => api(`/billing/operator/members/${memberId}`),
  markSession: (id, status) => api(`/billing/operator/sessions/${id}/mark`, { method: 'POST', body: { status } }),
};

export const meet = {
  info: (code) => api(`/meet/${code}`),
  signal: (code, body) => api(`/meet/${code}/signal`, { method: 'POST', body }),
  eventsUrl: (code) => `/api/meet/${code}/events?access_token=${encodeURIComponent(tokens.access || '')}`,
};

export const agentReview = {
  planReview: () => api('/agent/plan-review'),
};

export const journey = {
  status: () => api('/journey/status'),
  enroll: (status = 'enrolled') => api('/journey/credit-monitoring', { method: 'POST', body: { status } }),
  startMeeting: () => api('/journey/meeting', { method: 'POST', body: {} }),
  meeting: (id) => api(`/journey/meeting/${id}`),
  completeMeeting: (id, chosenPlan) => api(`/journey/meeting/${id}/complete`, { method: 'POST', body: { chosenPlan: chosenPlan ?? null } }),
  training: () => api('/journey/training'),
  propose: (body) => api('/journey/training/propose', { method: 'POST', body }),
  approve: () => api('/journey/training/approve', { method: 'POST', body: {} }),
  lesson: (moduleId) => api(`/journey/training/lessons/${moduleId}`),
  check: (moduleId, answers) => api(`/journey/training/lessons/${moduleId}/check`, { method: 'POST', body: { answers } }),
};
