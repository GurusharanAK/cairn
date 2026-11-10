// Cairn API Client
export const API_BASE = 
  (typeof import.meta !== 'undefined' && ((import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_BACKEND_URL)) ||
  (typeof window !== 'undefined' && (window.location.port === '3000' || window.location.port === '5173')
    ? 'http://127.0.0.1:8000'
    : (typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'http://127.0.0.1:8000'));

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

export async function resetDemoData() {
  const res = await fetch(`${API_BASE}/api/demo/reset`, {
    method: 'POST'
  });
  return handleResponse(res, 'Failed to reset demo data');
}

export async function fetchProjectScore(projectId: string, userId: string) {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/continuity-score`, {
    headers: { 'X-User-ID': userId }
  });
  return handleResponse(res, 'Failed to fetch score');
}

export async function fetchStressTest(projectId: string, userId: string) {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/stress-test`, {
    headers: { 'X-User-ID': userId }
  });
  return handleResponse(res, 'Failed to fetch stress test');
}

export async function fetchRehearsalQuestions(projectId: string, userId: string) {
  const res = await fetch(`${API_BASE}/api/rehearsal/${projectId}/questions`, {
    headers: { 'X-User-ID': userId }
  });
  return handleResponse(res, 'Failed to fetch questions');
}

export async function askRehearsalQuestion(projectId: string, question: string, userId: string) {
  const res = await fetch(`${API_BASE}/api/rehearsal/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': userId
    },
    body: JSON.stringify({ project_id: projectId, question })
  });
  return handleResponse(res, 'Failed to ask question');
}

export async function replyRehearsalQuestion(questionId: string, replyText: string, userId: string) {
  const res = await fetch(`${API_BASE}/api/rehearsal/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': userId
    },
    body: JSON.stringify({ question_id: questionId, reply_text: replyText })
  });
  return handleResponse(res, 'Failed to reply');
}

export async function reviewRehearsalQuestion(questionId: string, approved: boolean, comment: string | undefined, userId: string) {
  const res = await fetch(`${API_BASE}/api/rehearsal/review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': userId
    },
    body: JSON.stringify({ question_id: questionId, approved, manager_comment: comment })
  });
  return handleResponse(res, 'Failed to review');
}

export async function fetchReadinessScenarios(projectId: string, userId: string) {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/readiness/scenarios`, {
    headers: { 'X-User-ID': userId }
  });
  return handleResponse(res, 'Failed to fetch scenarios');
}

export async function fetchHandoverPacket(projectId: string, userId: string) {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/handover-packet`, {
    headers: { 'X-User-ID': userId }
  });
  return handleResponse(res, 'Failed to fetch handover packet');
}

export async function fetchKnowledgeModel(projectId: string, userId: string) {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/knowledge-model`, {
    headers: { 'X-User-ID': userId }
  });
  return handleResponse(res, 'Failed to fetch knowledge model');
}

export async function ingestDocument(
  projectId: string,
  payload: { title: string; source_type: string; content: string; access_level: string },
  userId: string = 'usr-mgr-01'
) {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': userId
    },
    body: JSON.stringify(payload)
  });
  return handleResponse(res, 'Failed to ingest document');
}
