import React, { useState } from 'react';
import { 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Link2, 
  ShieldAlert, 
  Layers, 
  ExternalLink,
  ChevronRight,
  Search,
  Filter
} from 'lucide-react';

interface KnowledgeModelExplorerProps {
  decisions: Array<{
    id: string;
    title: string;
    reason: string | null;
    status: string;
    source_id: string;
    evidence_quote?: string | null;
    is_approved_query?: boolean;
  }>;
  components: Array<{
    id: string;
    name: string;
    owner_name: string;
    status: string;
    source_id: string;
  }>;
  dependencies: Array<{
    id: string;
    source_name: string;
    target_name: string;
    type: string;
    is_hidden: boolean;
    source_id: string;
  }>;
  failures: Array<{
    id: string;
    title: string;
    error: string;
    fix: string;
    source_id: string;
  }>;
  approvedQueries?: Array<{
    id: string;
    question: string;
    reply?: string | null;
    approved_source_id?: string | null;
    manager_comment?: string | null;
  }>;
  auditHistory?: Array<{
    id: string;
    question_id: string;
    decision_id?: string | null;
    reviewer_id: string;
    action: string;
    review_note?: string | null;
    previous_status: string;
    minted_source_id?: string | null;
    created_at: string;
  }>;
}

export const KnowledgeModelExplorer: React.FC<KnowledgeModelExplorerProps> = ({
  decisions,
  components,
  dependencies,
  failures,
  approvedQueries = [],
  auditHistory = []
}) => {
  const [subTab, setSubTab] = useState<'DECISIONS' | 'APPROVED_QUERIES' | 'COMPONENTS' | 'DEPENDENCIES' | 'FAILURES'>('DECISIONS');

  // Derive all approved queries directly from decisions and approvedQueries prop
  const allApprovedQueries = React.useMemo(() => {
    const list = [...approvedQueries];
    decisions.forEach(d => {
      const isQuery = d.is_approved_query || (d.evidence_quote && d.evidence_quote.includes('Approved Rehearsal')) || d.title.startsWith('Verified Query:');
      if (isQuery && !list.some(q => q.id === d.id || q.question === d.title || (d.title.includes(q.question)))) {
        list.push({
          id: d.id,
          question: d.title.replace('Verified Query: ', ''),
          reply: d.reason,
          approved_source_id: d.source_id,
          manager_comment: 'Approved as Evidence'
        });
      }
    });
    return list;
  }, [decisions, approvedQueries]);

  return (
    <div className="bg-cream-50 border border-cream-300 rounded-2xl p-6 shadow-warm text-ink-900">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-cream-300 gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-light border border-orange-brand/30 text-orange-brand text-xs font-semibold mb-2">
            <Layers className="w-3.5 h-3.5" /> Stage 2 & 5: Project Intelligence Engine
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-ink-950 font-serif">Reconstructed Knowledge Model</h2>
          <p className="text-xs text-ink-700 mt-1 max-w-2xl leading-relaxed">
            The complete relational graph of project artifacts. Every entity is permanently linked to an authorized source document.
          </p>
        </div>

        {/* Tab Switcher Pills */}
        <div className="flex flex-wrap items-center gap-1.5 bg-cream-100 p-1 rounded-xl border border-cream-300 text-xs font-mono shadow-xs">
          <button
            onClick={() => setSubTab('DECISIONS')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              subTab === 'DECISIONS' ? 'bg-orange-brand text-cream-50 font-bold shadow-xs' : 'text-ink-700 hover:text-ink-950'
            }`}
          >
            Decisions ({decisions.length})
          </button>
          <button
            onClick={() => setSubTab('APPROVED_QUERIES')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              subTab === 'APPROVED_QUERIES' ? 'bg-orange-brand text-cream-50 font-bold shadow-xs' : 'text-ink-700 hover:text-ink-950'
            }`}
          >
            <span>Approved Queries</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              subTab === 'APPROVED_QUERIES' ? 'bg-cream-50 text-orange-brand' : 'bg-orange-light text-orange-brand'
            }`}>
              {allApprovedQueries.length}
            </span>
          </button>
          <button
            onClick={() => setSubTab('COMPONENTS')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              subTab === 'COMPONENTS' ? 'bg-orange-brand text-cream-50 font-bold shadow-xs' : 'text-ink-700 hover:text-ink-950'
            }`}
          >
            Components ({components.length})
          </button>
          <button
            onClick={() => setSubTab('DEPENDENCIES')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              subTab === 'DEPENDENCIES' ? 'bg-orange-brand text-cream-50 font-bold shadow-xs' : 'text-ink-700 hover:text-ink-950'
            }`}
          >
            Dependencies ({dependencies.length})
          </button>
          <button
            onClick={() => setSubTab('FAILURES')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              subTab === 'FAILURES' ? 'bg-orange-brand text-cream-50 font-bold shadow-xs' : 'text-ink-700 hover:text-ink-950'
            }`}
          >
            Failures ({failures.length})
          </button>
        </div>
      </div>

      {/* Content Stream */}
      <div className="mt-6 space-y-4">
        {/* TAB 1: DECISIONS */}
        {subTab === 'DECISIONS' && (
          <div className="space-y-3">
            {decisions.map((dec) => {
              const hasReason = dec.status === 'evidence_supported';
              const isApprovedQuery = dec.is_approved_query || (dec.evidence_quote && dec.evidence_quote.includes('Approved Rehearsal')) || dec.title.startsWith('Verified Query:');
              return (
                <div 
                  key={dec.id}
                  className="bg-cream-100 border border-cream-300 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs"
                >
                  <div className="space-y-1.5 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-ink-950 font-sans">{dec.title}</span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${
                        hasReason 
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200' 
                          : 'bg-rose-100 text-rose-800 border-rose-200'
                      }`}>
                        {hasReason ? 'EVIDENCE SUPPORTED' : 'REASON MISSING'}
                      </span>
                      {isApprovedQuery && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded border font-semibold bg-blue-100 text-blue-800 border-blue-300">
                          APPROVED QUERY
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-ink-700">
                      Reason: <strong className={hasReason ? 'text-ink-900' : 'text-rose-700'}>{dec.reason || 'None specified in source document'}</strong>
                    </p>

                    {dec.evidence_quote && (
                      <p className="text-[11px] font-mono text-ink-600 bg-cream-50 p-2 rounded-lg border border-cream-300/80 italic">
                        "{dec.evidence_quote}"
                      </p>
                    )}
                  </div>

                  <div className="text-right text-[11px] font-mono text-ink-600 flex-shrink-0">
                    <span className="block text-[10px] uppercase text-ink-500">Source ID:</span>
                    <span className="text-orange-brand font-semibold">{dec.source_id}</span>
                  </div>
                </div>
              );
            })}

            {auditHistory.length > 0 && (
              <div className="mt-6 pt-4 border-t border-cream-300 space-y-2">
                <h4 className="text-xs font-mono font-bold uppercase text-ink-700">
                  Immutable Approval Audit Trail ({auditHistory.length})
                </h4>
                {auditHistory.map((log) => (
                  <div key={log.id} className="bg-cream-100 border border-cream-300 p-3 rounded-xl text-[11px] font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded font-bold uppercase ${log.action === 'approved' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-rose-100 text-rose-800 border border-rose-300'}`}>
                          {log.action}
                        </span>
                        <span className="text-ink-900 font-semibold">Reviewer: {log.reviewer_id}</span>
                        <span className="text-ink-500">({log.previous_status} → {log.action})</span>
                      </div>
                      {log.review_note && <div className="text-ink-700 font-sans italic">Note: {log.review_note}</div>}
                    </div>
                    <div className="text-right text-ink-600">
                      {log.minted_source_id && <div className="text-orange-brand font-semibold">Minted: {log.minted_source_id}</div>}
                      <div>{new Date(log.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: APPROVED QUERIES */}
        {subTab === 'APPROVED_QUERIES' && (
          <div className="space-y-3">
            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-blue-700 flex-shrink-0" />
              <span>
                These questions were asked during Handover Rehearsal, answered by departing experts, verified by the Engineering Manager, and permanently appended into the project's knowledge model.
              </span>
            </div>
            {allApprovedQueries.length === 0 ? (
              <div className="p-8 text-center bg-cream-100 rounded-xl border border-cream-300 text-xs text-ink-600">
                No rehearsal queries approved yet. In the Rehearsal Dialogue, submit a reply and approve it as Manager to append verified knowledge here.
              </div>
            ) : (
              allApprovedQueries.map((q) => (
                <div 
                  key={q.id}
                  className="bg-cream-100 border border-blue-200 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs"
                >
                  <div className="space-y-2 max-w-2xl">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-ink-950 font-sans">{q.question}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded border font-semibold bg-emerald-100 text-emerald-800 border-emerald-300">
                        APPROVED AS EVIDENCE
                      </span>
                    </div>

                    <div className="text-xs text-ink-800 bg-cream-50 p-2.5 rounded-lg border border-cream-300/80">
                      <span className="font-semibold text-ink-950">Approved Rationale: </span>
                      {q.reply || "No reply text recorded."}
                    </div>

                    {q.manager_comment && (
                      <p className="text-[11px] font-mono text-ink-600">
                        Manager Sign-off: <span className="italic font-sans text-ink-800">{q.manager_comment}</span>
                      </p>
                    )}

                    {(() => {
                      const qLogs = auditHistory.filter(a => a.question_id === q.id);
                      if (qLogs.length === 0) return null;
                      return (
                        <div className="pt-1 space-y-1">
                          {qLogs.map(log => (
                            <div key={log.id} className="text-[10px] font-mono text-ink-600 bg-cream-50 px-2 py-1 rounded border border-cream-300">
                              Audit [{log.action.toUpperCase()}] by {log.reviewer_id} • {new Date(log.created_at).toLocaleString()}
                              {log.minted_source_id ? ` • Source: ${log.minted_source_id}` : ''}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="text-right text-[11px] font-mono text-ink-600 flex-shrink-0">
                    <span className="block text-[10px] uppercase text-ink-500">Verified Evidence ID:</span>
                    <span className="text-orange-brand font-semibold">{q.approved_source_id || 'src-doc-rehearsal'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 2: COMPONENTS */}
        {subTab === 'COMPONENTS' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {components.map((c) => (
              <div key={c.id} className="bg-cream-100 border border-cream-300 p-4 rounded-xl space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-ink-950">{c.name}</span>
                  <span className="text-[10px] font-mono bg-cream-200 border border-cream-300 px-2 py-0.5 rounded text-ink-700 font-semibold">
                    {c.status}
                  </span>
                </div>
                <div className="text-xs text-ink-700">
                  Owner: <strong className="text-ink-900">{c.owner_name}</strong>
                </div>
                <div className="text-[10px] font-mono text-ink-600 pt-2 border-t border-cream-300">
                  Source: <span className="text-orange-brand">{c.source_id}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: DEPENDENCIES */}
        {subTab === 'DEPENDENCIES' && (
          <div className="space-y-3">
            {dependencies.map((dep) => (
              <div 
                key={dep.id} 
                className="bg-cream-100 border border-cream-300 p-4 rounded-xl flex items-center justify-between text-xs shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="font-bold text-ink-950">{dep.source_name}</span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cream-200 border border-cream-300 text-ink-700">
                    {dep.type} →
                  </span>
                  <span className="font-bold text-ink-950">{dep.target_name}</span>
                  {dep.is_hidden && (
                    <span className="text-[10px] font-mono bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded font-bold">
                      HIDDEN DEPENDENCY
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-mono text-orange-brand font-semibold">{dep.source_id}</span>
              </div>
            ))}
          </div>
        )}

        {/* TAB 4: FAILURES */}
        {subTab === 'FAILURES' && (
          <div className="space-y-3">
            {failures.map((f) => (
              <div key={f.id} className="bg-cream-100 border border-cream-300 p-4 rounded-xl space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-ink-950">{f.title}</span>
                  <span className="text-[10px] font-mono text-orange-brand font-semibold">{f.source_id}</span>
                </div>
                <div className="bg-cream-50 p-2.5 rounded-lg border border-cream-300 font-mono text-[11px] space-y-1">
                  <div className="text-rose-800">Error: {f.error}</div>
                  <div className="text-emerald-800">Fix: {f.fix}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
