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
}

export const KnowledgeModelExplorer: React.FC<KnowledgeModelExplorerProps> = ({
  decisions,
  components,
  dependencies,
  failures
}) => {
  const [subTab, setSubTab] = useState<'DECISIONS' | 'COMPONENTS' | 'DEPENDENCIES' | 'FAILURES'>('DECISIONS');

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
        <div className="flex items-center gap-1.5 bg-cream-100 p-1 rounded-xl border border-cream-300 text-xs font-mono shadow-xs">
          <button
            onClick={() => setSubTab('DECISIONS')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              subTab === 'DECISIONS' ? 'bg-orange-brand text-cream-50 font-bold shadow-xs' : 'text-ink-700 hover:text-ink-950'
            }`}
          >
            Decisions ({decisions.length})
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
            {decisions.map((dec, idx) => {
              const hasReason = dec.status === 'evidence_supported';
              const isLatest = idx === 0;
              return (
                <div 
                  key={dec.id}
                  className={`bg-cream-100 border p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs transition-all ${
                    isLatest ? 'border-orange-brand/50 ring-1 ring-orange-brand/20 bg-cream-50' : 'border-cream-300'
                  }`}
                >
                  <div className="space-y-1.5 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-ink-950 font-sans">{dec.title}</span>
                      {isLatest && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-orange-light text-orange-brand border border-orange-brand/30">
                          LATEST
                        </span>
                      )}
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${
                        hasReason 
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200' 
                          : 'bg-rose-100 text-rose-800 border-rose-200'
                      }`}>
                        {hasReason ? 'EVIDENCE SUPPORTED' : 'REASON MISSING'}
                      </span>
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
