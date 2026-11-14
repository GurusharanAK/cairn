// Cairn API Client with HMAC-SHA256 Token Auth & Cold-Start Retry Backoff
export const API_BASE =
  (typeof import.meta !== 'undefined' && ((import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_BACKEND_URL)) ||
  (typeof window !== 'undefined' && (window.location.port === '3000' || window.location.port === '5173')
    ? 'http://127.0.0.1:8000'
    : (typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'http://127.0.0.1:8000'));

const tokenCache: Record<string, string> = {};

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  onWaking?: (waking: boolean, attempt?: number) => void;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  retryOpts?: RetryOptions
): Promise<Response> {
  const maxRetries = retryOpts?.retries ?? 0;
  const baseDelayMs = retryOpts?.baseDelayMs ?? 500;
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, init);
      // Retry on gateway cold-start / transient upstream errors (502, 503, 504)
      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < maxRetries) {
        retryOpts?.onWaking?.(true, attempt + 1);
        await sleep(baseDelayMs * Math.pow(2, attempt));
        continue;
      }
      if (attempt > 0) {
        retryOpts?.onWaking?.(false);
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        retryOpts?.onWaking?.(true, attempt + 1);
        await sleep(baseDelayMs * Math.pow(2, attempt));
        continue;
      }
    }
  }

  retryOpts?.onWaking?.(false);
  throw lastError || new Error('Network error reaching Cairn API backend.');
}

async function handleResponse(res: Response, defaultError: string) {
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // not JSON format
    }
  }

  if (!res.ok) {
    let msg = res.statusText || defaultError;
    if (data && data.detail) {
      msg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    } else if (text && text.length < 200) {
      msg = text;
    }
    const err = new Error(msg);
    (err as any).status = res.status;
    throw err;
  }

  if (!data && res.status !== 204) {
    throw new Error(
      `Server returned an empty response (HTTP ${res.status}). Ensure the FastAPI backend service is running.`
    );
  }

  return data;
}

export async function loginAsUser(
  userId: string,
  opts?: { forceRefresh?: boolean; retry?: RetryOptions }
): Promise<string> {
  if (!opts?.forceRefresh && tokenCache[userId]) {
    return tokenCache[userId];
  }

  const res = await fetchWithRetry(
    `${API_BASE}/api/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId })
    },
    opts?.retry
  );

  const data = await handleResponse(res, 'Failed to authenticate role session');
  if (!data?.access_token) {
    throw new Error('Authentication endpoint did not return a signed access_token.');
  }
  tokenCache[userId] = data.access_token;
  return data.access_token;
}

export function clearTokenCache(userId?: string) {
  if (userId) {
    delete tokenCache[userId];
  } else {
    Object.keys(tokenCache).forEach(k => delete tokenCache[k]);
  }
}

async function authFetch(
  url: string,
  userId: string,
  init: RequestInit = {},
  retryOpts?: RetryOptions
): Promise<Response> {
  const token = await loginAsUser(userId, { retry: retryOpts });
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  let res = await fetchWithRetry(url, { ...init, headers }, retryOpts);
  if (res.status === 401) {
    // Refresh expired/stale session token once
    const freshToken = await loginAsUser(userId, { forceRefresh: true, retry: retryOpts });
    headers.set('Authorization', `Bearer ${freshToken}`);
    res = await fetchWithRetry(url, { ...init, headers }, retryOpts);
  }
  return res;
}

export async function resetDemoData(userId: string = 'usr-mgr-01') {
  const res = await authFetch(`${API_BASE}/api/demo/reset`, userId, {
    method: 'POST'
  });
  const result = await handleResponse(res, 'Failed to reset demo data');
  clearTokenCache();
  await loginAsUser(userId, { forceRefresh: true });
  return result;
}

export async function fetchProjects(userId: string, retry?: RetryOptions) {
  const res = await authFetch(`${API_BASE}/api/projects`, userId, {}, retry);
  return handleResponse(res, 'Failed to fetch projects');
}

export async function fetchProjectScore(projectId: string, userId: string, retry?: RetryOptions) {
  const res = await authFetch(`${API_BASE}/api/projects/${projectId}/continuity-score`, userId, {}, retry);
  return handleResponse(res, 'Failed to fetch score');
}

export async function fetchStressTest(projectId: string, userId: string, retry?: RetryOptions) {
  const res = await authFetch(`${API_BASE}/api/projects/${projectId}/stress-test`, userId, {}, retry);
  return handleResponse(res, 'Failed to fetch stress test');
}

export async function simulateMultihopStressTest(projectId: string, userId: string) {
  const res = await authFetch(`${API_BASE}/api/projects/${projectId}/stress-test/simulate-multihop`, userId, {
    method: 'POST'
  });
  return handleResponse(res, 'Failed to execute 3-hop cascade simulation');
}

export async function fetchRehearsalQuestions(projectId: string, userId: string, retry?: RetryOptions) {
  const res = await authFetch(`${API_BASE}/api/rehearsal/${projectId}/questions`, userId, {}, retry);
  return handleResponse(res, 'Failed to fetch questions');
}

export async function fetchAuditHistory(projectId: string, userId: string, retry?: RetryOptions) {
  const res = await authFetch(`${API_BASE}/api/rehearsal/${projectId}/audit-history`, userId, {}, retry);
  return handleResponse(res, 'Failed to fetch approval audit history');
}

export async function askRehearsalQuestion(
  projectId: string,
  question: string,
  userId: string,
  links?: { knowledge_gap_id?: string; decision_id?: string }
) {
  const res = await authFetch(`${API_BASE}/api/rehearsal/ask`, userId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, question, ...links })
  });
  return handleResponse(res, 'Failed to ask question');
}

export async function replyRehearsalQuestion(questionId: string, replyText: string, userId: string) {
  const res = await authFetch(`${API_BASE}/api/rehearsal/reply`, userId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_id: questionId, reply_text: replyText })
  });
  return handleResponse(res, 'Failed to reply');
}

export async function reviewRehearsalQuestion(questionId: string, approved: boolean, comment: string | undefined, userId: string) {
  const res = await authFetch(`${API_BASE}/api/rehearsal/review`, userId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_id: questionId, approved, manager_comment: comment })
  });
  return handleResponse(res, 'Failed to review');
}

export async function fetchReadinessScenarios(projectId: string, userId: string, retry?: RetryOptions) {
  const res = await authFetch(`${API_BASE}/api/projects/${projectId}/readiness/scenarios`, userId, {}, retry);
  return handleResponse(res, 'Failed to fetch scenarios');
}

export async function fetchHandoverPacket(projectId: string, userId: string, retry?: RetryOptions) {
  const res = await authFetch(`${API_BASE}/api/projects/${projectId}/handover-packet`, userId, {}, retry);
  return handleResponse(res, 'Failed to fetch handover packet');
}

export async function fetchKnowledgeModel(projectId: string, userId: string, retry?: RetryOptions) {
  const res = await authFetch(`${API_BASE}/api/projects/${projectId}/knowledge-model`, userId, {}, retry);
  return handleResponse(res, 'Failed to fetch knowledge model');
}

export async function ingestDocument(
  projectId: string,
  payload: { title: string; source_type: string; content: string; access_level: string },
  userId: string = 'usr-mgr-01'
) {
  const res = await authFetch(`${API_BASE}/api/projects/${projectId}/ingest`, userId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handleResponse(res, 'Failed to ingest document');
}

export async function ingestFileArtifact(
  projectId: string,
  file: File,
  options: { title?: string; source_type?: string; access_level: string },
  userId: string = 'usr-mgr-01'
) {
  const form = new FormData();
  form.append('file', file);
  if (options.title) form.append('title', options.title);
  if (options.source_type) form.append('source_type', options.source_type);
  form.append('access_level', options.access_level);

  const res = await authFetch(`${API_BASE}/api/projects/${projectId}/ingest/file`, userId, {
    method: 'POST',
    body: form
  });
  return handleResponse(res, 'Failed to upload and ingest file');
}

export async function ingestGitHubSource(
  projectId: string,
  payload: { repo_slug?: string; title?: string; access_level: string; commits?: any[]; issues?: any[] },
  userId: string = 'usr-mgr-01'
) {
  const res = await authFetch(`${API_BASE}/api/projects/${projectId}/ingest/github`, userId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handleResponse(res, 'Failed to ingest GitHub source');
}
