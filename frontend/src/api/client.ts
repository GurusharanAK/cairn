// Cairn API Client
// Dynamically resolve API URL:
// 1. Vite environment variable (e.g. VITE_API_URL) if provided
// 2. Relative path "" when running on production domains (e.g. Render, Vercel)
// 3. http://127.0.0.1:8000 only when running on local dev machine
export function getApiBaseUrl(): string {
  // Vite env variable
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.replace(/\/+$/, '');
  }

  // Browser execution check
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://127.0.0.1:8000';
    }
    // On deployed host (Render, etc.), use relative URL to route to same-domain backend
    return '';
  }

  return 'http://127.0.0.1:8000';
}

export const API_BASE = getApiBaseUrl();

export interface IngestDocumentPayload {
  title: string;
  source_type: string;
  content: string;
  access_level: string;
  doc_metadata?: Record<string, any>;
  structured_payload?: Record<string, any>;
}

export async function ingestSourceDocument(projectId: string, payload: IngestDocumentPayload, userId: string = 'usr-mgr-01') {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': userId
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Failed to ingest document: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchProjectScore(projectId: string, userId: string) {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/continuity-score`, {
    headers: { 'X-User-ID': userId }
  });
  if (!res.ok) throw new Error(`Failed to fetch score: ${res.statusText}`);
  return res.json();
}

export async function fetchStressTest(projectId: string, userId: string) {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/stress-test`, {
    headers: { 'X-User-ID': userId }
  });
  if (!res.ok) throw new Error(`Failed to fetch stress test: ${res.statusText}`);
  return res.json();
}

export async function fetchRehearsalQuestions(projectId: string, userId: string) {
  const res = await fetch(`${API_BASE}/api/rehearsal/${projectId}/questions`, {
    headers: { 'X-User-ID': userId }
  });
  if (!res.ok) throw new Error(`Failed to fetch questions: ${res.statusText}`);
  return res.json();
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
  if (!res.ok) throw new Error(`Failed to ask question: ${res.statusText}`);
  return res.json();
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
  if (!res.ok) throw new Error(`Failed to reply: ${res.statusText}`);
  return res.json();
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
  if (!res.ok) throw new Error(`Failed to review: ${res.statusText}`);
  return res.json();
}

export async function fetchReadinessScenarios(projectId: string, userId: string) {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/readiness/scenarios`, {
    headers: { 'X-User-ID': userId }
  });
  if (!res.ok) throw new Error(`Failed to fetch scenarios: ${res.statusText}`);
  return res.json();
}

export async function fetchHandoverPacket(projectId: string, userId: string) {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/handover-packet`, {
    headers: { 'X-User-ID': userId }
  });
  if (!res.ok) throw new Error(`Failed to fetch handover packet: ${res.statusText}`);
  return res.json();
}

export async function fetchKnowledgeModel(projectId: string, userId: string) {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/knowledge-model`, {
    headers: { 'X-User-ID': userId }
  });
  if (!res.ok) throw new Error(`Failed to fetch knowledge model: ${res.statusText}`);
  return res.json();
}

