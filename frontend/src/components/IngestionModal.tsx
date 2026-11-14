import React, { useState } from 'react';
import { ingestDocument, ingestFileArtifact, ingestGitHubSource } from '../api/client';
import {
  FileUp,
  CheckCircle2,
  AlertCircle,
  GitCommit,
  FileText,
  Upload
} from 'lucide-react';

interface IngestionModalProps {
  projectId: string;
  currentUserId?: string;
  isOpen: boolean;
  onClose: () => void;
  onIngestSuccess: () => void;
}

type IngestMode = 'TEXT' | 'FILE' | 'GITHUB';

export const IngestionModal: React.FC<IngestionModalProps> = ({
  projectId,
  currentUserId = 'usr-mgr-01',
  isOpen,
  onClose,
  onIngestSuccess
}) => {
  const [mode, setMode] = useState<IngestMode>('TEXT');
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState('DOC');
  const [content, setContent] = useState('');
  const [accessLevel, setAccessLevel] = useState('RESTRICTED_TEAM');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [githubSlug, setGithubSlug] = useState('');
  const [githubExportJson, setGithubExportJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePreloadDemo = (type: 'COMMIT' | 'DECISION_WITH_REASON' | 'DECISION_WITHOUT_REASON' | 'CODE_IMPORTS') => {
    setMode('TEXT');
    if (type === 'COMMIT') {
      setTitle('git commit 88f2a1: Add Redis cache layer');
      setSourceType('GITHUB_COMMIT');
      setContent('commit 88f2a1b9\nAuthor: Departing Member <departing.member@cairn.local>\n\nDecided to add Redis cache layer in front of PostgreSQL database. Reason: Cache merchant session tokens to reduce DB query pressure during peak trading hours.');
    } else if (type === 'DECISION_WITHOUT_REASON') {
      setTitle('Team Slack Export: Notification Polling Interval');
      setSourceType('TASK_EXPORT');
      setContent('Departing Member: Decided to set notification polling interval to 15 seconds. Component: Notification Worker. Owner: Departing Member.');
    } else if (type === 'CODE_IMPORTS') {
      setTitle('payment_worker.py: Service & Dependency Imports');
      setSourceType('DOC');
      setContent('from auth_core.tokens import verify_jwt\nimport stripe_client\nSETTLEMENT_SERVICE_URL = https://settlement.internal:8443\nDecided to verify JWT signatures locally because round-trip latency exceeded 40ms.');
    } else {
      setTitle('ADR-003: Storage Engine Selection');
      setSourceType('DOC');
      setContent('We decided to use AWS S3 for statement archiving because cold storage costs are 90% lower than primary disk storage.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let data: any;
      if (mode === 'TEXT') {
        if (!title.trim() || !content.trim()) {
          throw new Error('Title and document content are required.');
        }
        data = await ingestDocument(
          projectId,
          {
            title: title.trim(),
            source_type: sourceType,
            content: content.trim(),
            access_level: accessLevel
          },
          currentUserId
        );
      } else if (mode === 'FILE') {
        if (!selectedFile) {
          throw new Error('Select a file (.txt, .md, .json, .csv, code) to upload.');
        }
        data = await ingestFileArtifact(
          projectId,
          selectedFile,
          {
            title: title.trim() || undefined,
            source_type: sourceType || undefined,
            access_level: accessLevel
          },
          currentUserId
        );
      } else {
        let commits: any[] | undefined;
        let issues: any[] | undefined;
        if (githubExportJson.trim()) {
          const parsed = JSON.parse(githubExportJson.trim());
          if (Array.isArray(parsed)) {
            commits = parsed;
          } else {
            commits = parsed.commits;
            issues = parsed.issues;
          }
        }
        if (!githubSlug.trim() && !commits && !issues) {
          throw new Error('Provide either a public GitHub repo slug (owner/repo) or exported commits/issues JSON.');
        }
        data = await ingestGitHubSource(
          projectId,
          {
            repo_slug: githubSlug.trim() || undefined,
            title: title.trim() || undefined,
            access_level: accessLevel,
            commits,
            issues
          },
          currentUserId
        );
      }

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
                Deterministic extraction with strict verbatim quote verification & code dependency detection.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-600 hover:text-ink-950 text-sm font-mono">✕</button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Ingestion Mode Selector */}
          <div className="flex items-center gap-2 border-b border-cream-300 pb-3">
            <button
              type="button"
              onClick={() => { setMode('TEXT'); setError(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors ${
                mode === 'TEXT' ? 'bg-ink-950 text-cream-50' : 'bg-cream-100 text-ink-700 hover:bg-cream-200 border border-cream-300'
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> Paste Text / Spec
            </button>
            <button
              type="button"
              onClick={() => { setMode('FILE'); setError(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors ${
                mode === 'FILE' ? 'bg-ink-950 text-cream-50' : 'bg-cream-100 text-ink-700 hover:bg-cream-200 border border-cream-300'
              }`}
            >
              <Upload className="w-3.5 h-3.5" /> Upload Artifact File
            </button>
            <button
              type="button"
              onClick={() => { setMode('GITHUB'); setError(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors ${
                mode === 'GITHUB' ? 'bg-ink-950 text-cream-50' : 'bg-cream-100 text-ink-700 hover:bg-cream-200 border border-cream-300'
              }`}
            >
              <GitCommit className="w-3.5 h-3.5" /> GitHub Repo / Export
            </button>
          </div>

          {mode === 'TEXT' && (
            <div className="bg-cream-100 p-3 rounded-xl border border-cream-300 flex flex-wrap items-center gap-2 text-xs shadow-xs">
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
                Missing Reason (Triggers Gap)
              </button>
              <button
                type="button"
                onClick={() => handlePreloadDemo('COMMIT')}
                className="bg-cream-50 hover:bg-cream-200 text-ink-800 px-2.5 py-1 rounded-lg border border-cream-300 text-[11px] transition-colors shadow-xs"
              >
                GitHub Commit
              </button>
              <button
                type="button"
                onClick={() => handlePreloadDemo('CODE_IMPORTS')}
                className="bg-cream-50 hover:bg-cream-200 text-ink-800 px-2.5 py-1 rounded-lg border border-cream-300 text-[11px] transition-colors shadow-xs"
              >
                Code Imports
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-mono text-ink-700 uppercase mb-1 font-semibold">
                  Source Title {mode !== 'TEXT' && '(Optional)'}
                </label>
                <input
                  type="text"
                  required={mode === 'TEXT'}
                  placeholder="e.g. ADR 002: Notification Polling Strategy"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-cream-100 border border-cream-300 rounded-xl px-3.5 py-2 text-xs text-ink-950 placeholder-ink-400 focus:outline-none focus:border-orange-brand shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-ink-700 uppercase mb-1 font-semibold">
                  Clearance Level
                </label>
                <select
                  value={accessLevel}
                  onChange={(e) => setAccessLevel(e.target.value)}
                  className="w-full bg-cream-100 border border-cream-300 rounded-xl px-3 py-2 text-xs text-ink-950 focus:outline-none focus:border-orange-brand shadow-xs"
                >
                  <option value="PUBLIC">PUBLIC</option>
                  <option value="RESTRICTED_TEAM">RESTRICTED_TEAM</option>
                  <option value="RESTRICTED_MANAGER">RESTRICTED_MANAGER</option>
                </select>
              </div>
            </div>

            {mode === 'TEXT' && (
              <>
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

                <div>
                  <label className="block text-xs font-mono text-ink-700 uppercase mb-1 font-semibold">
                    Document Raw Text / Extracted Dump
                  </label>
                  <textarea
                    rows={5}
                    required
                    placeholder="Paste verbatim notes, code imports, config URLs, or git commit text here..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="w-full bg-cream-100 border border-cream-300 rounded-xl p-3 text-xs text-ink-950 placeholder-ink-400 font-mono focus:outline-none focus:border-orange-brand shadow-xs"
                  />
                </div>
              </>
            )}

            {mode === 'FILE' && (
              <div className="bg-cream-100 border border-dashed border-cream-400 rounded-xl p-5 space-y-2 text-center">
                <input
                  type="file"
                  accept=".txt,.md,.json,.csv,.py,.ts,.tsx,.js,.yaml,.yml,.env,.pdf,.docx"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="text-xs font-mono text-ink-800"
                />
                <p className="text-[11px] text-ink-600 font-mono">
                  Supports .txt, .md, .json, .csv, source files (.py/.ts/.js), plus .pdf/.docx when parsers are installed.
                </p>
              </div>
            )}

            {mode === 'GITHUB' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-mono text-ink-700 uppercase mb-1 font-semibold">
                    Public GitHub Repository (owner/repo)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. octocat/Hello-World"
                    value={githubSlug}
                    onChange={(e) => setGithubSlug(e.target.value)}
                    className="w-full bg-cream-100 border border-cream-300 rounded-xl px-3.5 py-2 text-xs text-ink-950 placeholder-ink-400 font-mono focus:outline-none focus:border-orange-brand shadow-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-ink-700 uppercase mb-1 font-semibold">
                    Or Paste Exported Commits / Issues JSON
                  </label>
                  <textarea
                    rows={4}
                    placeholder='{"commits": [{"sha": "a1b2c3d", "author": "dev", "message": "Decided to use Redis because..."}], "issues": []}'
                    value={githubExportJson}
                    onChange={(e) => setGithubExportJson(e.target.value)}
                    className="w-full bg-cream-100 border border-cream-300 rounded-xl p-3 text-xs text-ink-950 placeholder-ink-400 font-mono focus:outline-none focus:border-orange-brand shadow-xs"
                  />
                </div>
              </div>
            )}

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
                  <span className="bg-cream-50 px-2 py-1 rounded text-indigo-800 border border-cream-300">
                    Deps: {result.summary.dependencies_count}
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
