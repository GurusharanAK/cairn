import React, { useState } from 'react';
import { API_BASE } from '../api/client';
import { 
  FileUp, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  GitCommit, 
  Layers, 
  HelpCircle,
  Plus,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';

interface IngestionModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onIngestSuccess: () => void;
}

export const IngestionModal: React.FC<IngestionModalProps> = ({
  projectId,
  isOpen,
  onClose,
  onIngestSuccess
}) => {
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState('DOC');
  const [content, setContent] = useState('');
  const [accessLevel, setAccessLevel] = useState('RESTRICTED_TEAM');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePreloadDemo = (type: 'COMMIT' | 'DECISION_WITH_REASON' | 'DECISION_WITHOUT_REASON') => {
    if (type === 'COMMIT') {
      setTitle('git commit 88f2a1: Add Redis cache layer');
      setSourceType('GITHUB_COMMIT');
      setContent('commit 88f2a1b9\nAuthor: Departing Member <departing.member@cairn.local>\n\nDecided to add Redis cache layer in front of PostgreSQL database. Reason: Cache merchant session tokens to reduce DB query pressure during peak trading hours.');
    } else if (type === 'DECISION_WITHOUT_REASON') {
      setTitle('Team Slack Export: Notification Polling Interval');
      setSourceType('TASK_EXPORT');
      setContent('Departing Member: Decided to set notification polling interval to 15 seconds. Component: Notification Worker. Owner: Departing Member.');
    } else {
      setTitle('ADR-003: Storage Engine Selection');
      setSourceType('DOC');
      setContent('We decided to use AWS S3 for statement archiving because cold storage costs are 90% lower than primary disk storage.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': 'usr-mgr-01'
        },
        body: JSON.stringify({
          title: title.trim(),
          source_type: sourceType,
          content: content.trim(),
          access_level: accessLevel
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to ingest document');
      }

      const data = await res.json();
      setResult(data);
      onIngestSuccess();
    } catch (err: any) {
      setError(err.message || 'Error occurred during ingestion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/40 backdrop-blur-sm">
      <div className="bg-cream-50 border border-cream-300 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden text-ink-900">
        {/* Header */}
        <div className="p-5 px-6 border-b border-cream-300 flex items-center justify-between bg-cream-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-light border border-orange-brand/30 flex items-center justify-center">
              <FileUp className="w-5 h-5 text-orange-brand" />
            </div>
            <div>
              <h3 className="text-base font-bold text-ink-950 font-serif flex items-center gap-2">
                Ingest Authorized Project Source
                <span className="text-[10px] font-mono font-bold bg-orange-light text-orange-brand border border-orange-brand/30 px-2 py-0.5 rounded-full">
                  Stage 1: Connect & Reconstruct
                </span>
              </h3>
              <p className="text-xs text-ink-600">
                Deterministic extraction: claims must carry source IDs. Missing reasons are strictly flagged.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-600 hover:text-ink-950 text-sm font-mono">✕</button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Demo Preload Chips */}
          <div className="bg-cream-100 p-3 rounded-xl border border-cream-300 flex items-center gap-2 text-xs shadow-xs">
            <span className="text-ink-600 font-mono text-[11px] flex-shrink-0 font-semibold">Sample Templates:</span>
            <button
              type="button"
              onClick={() => handlePreloadDemo('DECISION_WITH_REASON')}
              className="bg-cream-50 hover:bg-cream-200 text-ink-800 px-2.5 py-1 rounded-lg border border-cream-300 text-[11px] transition-colors shadow-xs"
            >
              Document with Reason
            </button>
            <button
              type="button"
              onClick={() => handlePreloadDemo('DECISION_WITHOUT_REASON')}
              className="bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 px-2.5 py-1 rounded-lg text-[11px] transition-colors font-semibold"
            >
              Missing Reason Sample (Triggers Gap)
            </button>
            <button
              type="button"
              onClick={() => handlePreloadDemo('COMMIT')}
              className="bg-cream-50 hover:bg-cream-200 text-ink-800 px-2.5 py-1 rounded-lg border border-cream-300 text-[11px] transition-colors shadow-xs"
            >
              GitHub Commit
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono text-ink-700 uppercase mb-1 font-semibold">
                  Source Title / Commit Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ADR 002: Notification Polling Strategy"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-cream-100 border border-cream-300 rounded-xl px-3.5 py-2 text-xs text-ink-950 placeholder-ink-400 focus:outline-none focus:border-orange-brand shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-ink-700 uppercase mb-1 font-semibold">
                  Source Type
                </label>
                <select
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value)}
                  className="w-full bg-cream-100 border border-cream-300 rounded-xl px-3.5 py-2 text-xs text-ink-950 focus:outline-none focus:border-orange-brand shadow-xs"
                >
                  <option value="DOC">Architecture Document (DOC/PDF)</option>
                  <option value="GITHUB_COMMIT">GitHub Commit Message</option>
                  <option value="TASK_EXPORT">Task Export / Jira / Slack</option>
                  <option value="APPROVED_NOTE">Approved Technical Note</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-ink-700 uppercase mb-1 font-semibold">
                Document Raw Text / Extracted Dump
              </label>
              <textarea
                rows={5}
                required
                placeholder="Paste verbatim notes, meeting transcription summary, or git commit text here..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full bg-cream-100 border border-cream-300 rounded-xl p-3 text-xs text-ink-950 placeholder-ink-400 font-mono focus:outline-none focus:border-orange-brand shadow-xs"
              />
            </div>

            {error && (
              <div className="bg-rose-100 border border-rose-300 p-3 rounded-xl text-xs text-rose-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
              </div>
            )}

            {result && (
              <div className="bg-orange-light/50 border border-orange-brand/30 p-4 rounded-xl space-y-2 text-xs shadow-xs">
                <div className="flex items-center gap-2 text-orange-brand font-bold font-mono">
                  <CheckCircle2 className="w-4 h-4" /> INGESTION & EXTRACTION COMPLETE
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                  <span className="bg-cream-50 px-2 py-1 rounded text-ink-800 border border-cream-300">
                    Decisions: {result.summary.decisions_count}
                  </span>
                  <span className="bg-cream-50 px-2 py-1 rounded text-emerald-800 font-bold border border-cream-300">
                    Verified: {result.summary.evidence_supported_decisions}
                  </span>
                  <span className="bg-cream-50 px-2 py-1 rounded text-rose-800 border border-cream-300">
                    Missing Reason: {result.summary.reason_missing_decisions}
                  </span>
                  <span className="bg-cream-50 px-2 py-1 rounded text-amber-800 border border-cream-300">
                    Gaps Flagged: {result.summary.knowledge_gaps_count}
                  </span>
                </div>
                <div className="pt-2 text-[10px] font-mono text-ink-600">
                  Minted Source ID: <span className="text-orange-brand font-semibold">{result.source_document.id}</span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-ink-600 hover:text-ink-950"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={loading}
                className="bg-orange-brand hover:bg-orange-bright disabled:opacity-50 text-cream-50 font-bold text-xs px-5 py-2.5 rounded-xl shadow-sm flex items-center gap-2"
              >
                {loading ? 'Extracting Claims...' : 'Ingest & Extract Claims'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
