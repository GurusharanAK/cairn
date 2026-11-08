import React from 'react';
import {
  ShieldCheck,
  FileText,
  Users,
  Link2,
  HelpCircle,
  ArrowUpRight,
  Activity,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

export interface ScoreBreakdown {
  overall_score: number;
  evidence_coverage_score: number; // max 40
  ownership_clarity_score: number;  // max 20
  dependency_doc_score: number;     // max 20
  gap_penalty_score: number;        // max 20
  metrics: {
    total_components: number;
    total_decisions: number;
    evidence_supported_decisions: number;
    reason_missing_decisions: number;
    total_dependencies: number;
    hidden_dependencies_count: number;
    open_knowledge_gaps: number;
    resolved_knowledge_gaps: number;
  };
}

interface ContinuityScoreWidgetProps {
  scoreData: ScoreBreakdown;
  onRefresh?: () => void;
}

export const ContinuityScoreWidget: React.FC<ContinuityScoreWidgetProps> = ({ scoreData, onRefresh }) => {
  const {
    overall_score,
    evidence_coverage_score,
    ownership_clarity_score,
    dependency_doc_score,
    gap_penalty_score,
    metrics
  } = scoreData;

  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (overall_score / 100) * circumference;

  return (
    <div className="relative overflow-hidden bg-cream-50 border border-cream-300 rounded-2xl p-6 shadow-warm">
      {/* Subtle Warm Orange Glow in Background */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-orange-brand/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-cream-300">
        <div className="flex items-center gap-5">
          {/* Radial Circular Progress Gauge (Burnt Orange Stroke on Warm Cream) */}
          <div className="relative w-24 h-24 flex items-center justify-center flex-shrink-0">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="40"
                className="stroke-cream-300"
                strokeWidth="8"
                fill="transparent"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                stroke="#C85A17"
                strokeWidth="8"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className="text-xl font-black font-mono tracking-tight text-ink-950">
                {overall_score}
              </span>
              <span className="text-[10px] text-ink-600 font-mono -mt-1 font-semibold">/ 100</span>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-xl font-bold tracking-tight text-ink-950 font-serif flex items-center gap-2">
                Continuity Score Index
              </h3>
              <span className="text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full border bg-orange-light border-orange-brand/30 text-orange-brand">
                {overall_score >= 70 ? 'Verified Continuity' : 'Gaps Under Review'}
              </span>
            </div>
            <p className="text-xs text-ink-700 max-w-xl leading-relaxed">
              Deterministic project readiness index built from verified evidence coverage, clear ownership mapping,
              dependency transparency, and critical gap resolution. Not an arbitrary AI guess.
            </p>
          </div>
        </div>

        {/* Quick Diagnostic Metrics Pill */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full lg:w-auto font-mono text-xs">
          <div className="bg-cream-100 p-2.5 rounded-xl border border-cream-300 text-center shadow-xs">
            <span className="text-[10px] text-ink-600 uppercase block">Components</span>
            <span className="text-sm font-bold text-ink-900">{metrics.total_components}</span>
          </div>
          <div className="bg-cream-100 p-2.5 rounded-xl border border-cream-300 text-center shadow-xs">
            <span className="text-[10px] text-ink-600 uppercase block">Decisions</span>
            <span className="text-sm font-bold text-ink-900">{metrics.total_decisions}</span>
          </div>
          <div className="bg-cream-100 p-2.5 rounded-xl border border-cream-300 text-center shadow-xs">
            <span className="text-[10px] text-ink-600 uppercase block">Open Gaps</span>
            <span className="text-sm font-bold text-amber-700">{metrics.open_knowledge_gaps}</span>
          </div>
          <div className="bg-cream-100 p-2.5 rounded-xl border border-cream-300 text-center shadow-xs">
            <span className="text-[10px] text-ink-600 uppercase block">Hidden Deps</span>
            <span className="text-sm font-bold text-orange-brand">{metrics.hidden_dependencies_count}</span>
          </div>
        </div>
      </div>

      {/* 4 Pillars Breakdown (Section II Invariants) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
        {/* Pillar 1: Evidence Coverage (40%) */}
        <div className="bg-cream-100 p-4 rounded-xl border border-cream-300 space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-ink-800 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-orange-brand" /> Evidence Coverage
            </span>
            <span className="font-mono font-bold text-orange-brand">{evidence_coverage_score} / 40</span>
          </div>
          <div className="w-full bg-cream-300 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-orange-brand h-1.5 rounded-full transition-all duration-700"
              style={{ width: `${(evidence_coverage_score / 40) * 100}%` }}
            />
          </div>
          <p className="text-[11px] text-ink-600 leading-tight">
            {metrics.evidence_supported_decisions} of {metrics.total_decisions} decisions backed by verified text sources.
          </p>
        </div>

        {/* Pillar 2: Ownership Clarity (20%) */}
        <div className="bg-cream-100 p-4 rounded-xl border border-cream-300 space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-ink-800 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-orange-brand" /> Ownership Clarity
            </span>
            <span className="font-mono font-bold text-orange-brand">{ownership_clarity_score} / 20</span>
          </div>
          <div className="w-full bg-cream-300 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-orange-brand h-1.5 rounded-full transition-all duration-700"
              style={{ width: `${(ownership_clarity_score / 20) * 100}%` }}
            />
          </div>
          <p className="text-[11px] text-ink-600 leading-tight">
            Departing member owns critical components with handover pending.
          </p>
        </div>

        {/* Pillar 3: Dependency Doc (20%) */}
        <div className="bg-cream-100 p-4 rounded-xl border border-cream-300 space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-ink-800 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-orange-brand" /> Dependency Doc
            </span>
            <span className="font-mono font-bold text-orange-brand">{dependency_doc_score} / 20</span>
          </div>
          <div className="w-full bg-cream-300 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-orange-brand h-1.5 rounded-full transition-all duration-700"
              style={{ width: `${(dependency_doc_score / 20) * 100}%` }}
            />
          </div>
          <p className="text-[11px] text-ink-600 leading-tight">
            {metrics.hidden_dependencies_count} hidden / undocumented call links discovered.
          </p>
        </div>

        {/* Pillar 4: Gap Resolution (20%) */}
        <div className="bg-cream-100 p-4 rounded-xl border border-cream-300 space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-ink-800 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-orange-brand" /> Gap Resolution
            </span>
            <span className="font-mono font-bold text-orange-brand">{gap_penalty_score} / 20</span>
          </div>
          <div className="w-full bg-cream-300 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-orange-brand h-1.5 rounded-full transition-all duration-700"
              style={{ width: `${(gap_penalty_score / 20) * 100}%` }}
            />
          </div>
          <p className="text-[11px] text-ink-600 leading-tight">
            {metrics.open_knowledge_gaps} unverified assumptions pending member answer.
          </p>
        </div>
      </div>
    </div>
  );
};
