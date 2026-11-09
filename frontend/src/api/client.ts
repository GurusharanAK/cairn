// Cairn API Client
export const API_BASE = typeof window !== 'undefined' && window.location.port === '3000'
  ? 'http://127.0.0.1:8000'
  : (typeof window !== 'undefined' && window.location.port !== '5173' && window.location.origin ? window.location.origin : 'http://127.0.0.1:8000');

export async function resetDemoData() {
  const res = await fetch(`${API_BASE}/api/demo/reset`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error(`Failed to reset demo data: ${res.statusText}`);
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


