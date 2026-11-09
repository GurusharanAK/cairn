import React, { useState } from 'react';
import { 
  AlertOctagon, 
  ArrowRight, 
  GitFork, 
  UserMinus, 
  HelpCircle, 
  ShieldAlert, 
  CheckCircle2, 
  ExternalLink,
  Zap,
  Info,
  Clock,
  ChevronRight
} from 'lucide-react';

export interface ComponentImpact {
  component_id: string;
  component_name: string;
  owner_id: string;
  owner_name: string;
  impact_type: 'DIRECT_OWNERSHIP' | 'DOWNSTREAM_DEPENDENCY' | 'CASCADE_BLOCKED';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  dependency_depth: number;
  direct_dependency_path: string[];
  missing_reasons_count: number;
  open_gaps_count: number;
  unresolved_failures_count: number;
  suggested_action: string;
}

export interface StressTestReport {
  project_id: string;
  departing_member_id: string;
  departing_member_name: string;
  total_components_analyzed: number;
  directly_affected_components: ComponentImpact[];
  downstream_affected_components: ComponentImpact[];
  single_points_of_failure: string[];
  summary: {
    direct_count: number;
    downstream_count: number;
    critical_single_points_count: number;
    max_cascade_depth: number;
  };
}

interface ContinuityStressTestViewProps {
  report: StressTestReport;
  onInitiateRehearsalForComponent?: (componentName: string) => void;
}

export const ContinuityStressTestView: React.FC<ContinuityStressTestViewProps> = ({
  report,
  onInitiateRehearsalForComponent
}) => {
  const [selectedCompId, setSelectedCompId] = useState<string>(
    report.directly_affected_components[0]?.component_id || ''
  );

  const allImpacts = [
    ...report.directly_affected_components,
    ...report.downstream_affected_components
  ];

  const selectedComponent = allImpacts.find(c => c.component_id === selectedCompId) || allImpacts[0];

  const getSeverityBadge = (severity: 'HIGH' | 'MEDIUM' | 'LOW') => {
    switch (severity) {
      case 'HIGH':
        return 'bg-orange-light border-orange-brand/40 text-orange-brand font-bold';
      case 'MEDIUM':
        return 'bg-amber-100 border-amber-300 text-amber-900 font-semibold';
      case 'LOW':
        return 'bg-cream-200 border-cream-400 text-ink-700';
    }
  };

  return (
    <div className="bg-cream-50 border border-cream-300 rounded-2xl p-6 shadow-warm text-ink-900">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-cream-300 gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-light border border-orange-brand/30 text-orange-brand text-xs font-semibold mb-2">
            <Zap className="w-3.5 h-3.5" /> Stage 4: Controlled Departure Simulation
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-ink-950 font-serif">
            Continuity Stress Test: {report.departing_member_name}
          </h2>
          <p className="text-xs text-ink-700 mt-1 max-w-2xl leading-relaxed">
            Deterministic relational BFS simulation. Identifies directly stranded repositories and cascades 
            through undocumented call chains where downstream services rely on unrecorded knowledge.
          </p>
        </div>

        {/* Impact Summary Badges */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="bg-cream-100 border border-cream-300 px-3.5 py-2 rounded-xl text-center shadow-xs">
            <span className="text-[10px] text-ink-600 block">DIRECT SPOFs</span>
            <span className="text-base font-bold text-orange-brand">{report.summary.direct_count}</span>
          </div>
          <div className="bg-cream-100 border border-cream-300 px-3.5 py-2 rounded-xl text-center shadow-xs">
            <span className="text-[10px] text-ink-600 block">DOWNSTREAM AT-RISK</span>
            <span className="text-base font-bold text-amber-700">{report.summary.downstream_count}</span>
          </div>
          <div className="bg-cream-100 border border-cream-300 px-3.5 py-2 rounded-xl text-center shadow-xs">
            <span className="text-[10px] text-ink-600 block">MAX DEPTH</span>
            <span className="text-base font-bold text-ink-900">{report.summary.max_cascade_depth} hops</span>
          </div>
        </div>
      </div>

      {/* Main Flow Grid: Slide 4 Visual Blueprint */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        {/* Left Column: Visual Impact Flowchart */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-ink-600 flex items-center gap-2">
              <GitFork className="w-4 h-4 text-orange-brand" /> Dependency Impact Flowchart
            </h3>
            <span className="text-[11px] text-ink-600 font-mono">Select a node to inspect diagnostic evidence</span>
          </div>

          {/* Level 0: The Departing Member Origin Node */}
          <div className="bg-cream-100 border-2 border-dashed border-orange-brand/50 rounded-2xl p-4 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-brand text-cream-50 flex items-center justify-center font-bold">
                <UserMinus className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-mono text-orange-brand uppercase tracking-wider font-bold">
                  SIMULATED DEPARTING ABSENCE
                </span>
                <h4 className="font-bold text-sm text-ink-950 font-serif">{report.departing_member_name}</h4>
                <p className="text-[11px] text-ink-600">Primary maintainer of core services</p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold bg-orange-light text-orange-brand px-3 py-1 rounded-full border border-orange-brand/30">
              Absence Trigger
            </span>
          </div>

          {/* Connecting Arrow */}
          <div className="flex items-center justify-center py-1 text-orange-brand">
            <div className="h-6 w-0.5 bg-orange-brand/30"></div>
          </div>

          {/* Level 1: Directly Stranded Components */}
          <div className="space-y-3">
            <div className="text-[11px] font-mono text-ink-600 uppercase flex items-center justify-between">
              <span>Directly Owned by Departing Member (Depth: 0)</span>
              <span className="text-orange-brand font-bold">{report.directly_affected_components.length} components</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {report.directly_affected_components.map((comp) => {
                const isSelected = comp.component_id === selectedCompId;
                return (
                  <div
                    key={comp.component_id}
                    onClick={() => setSelectedCompId(comp.component_id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer relative ${
                      isSelected
                        ? 'bg-cream-50 border-orange-brand shadow-sm ring-2 ring-orange-brand/20'
                        : 'bg-cream-100 border-cream-300 hover:border-cream-400'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="font-bold text-sm text-ink-950">{comp.component_name}</span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${getSeverityBadge(comp.severity)}`}>
                        {comp.severity}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] font-mono text-ink-600 mb-3">
                      <span>Owner: {comp.owner_name}</span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] font-mono flex-wrap">
                      {comp.missing_reasons_count > 0 && (
                        <span className="bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 rounded">
                          {comp.missing_reasons_count} missing reason
                        </span>
                      )}
                      {comp.open_gaps_count > 0 && (
                        <span className="bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded">
                          {comp.open_gaps_count} open gap
                        </span>
                      )}
                      {comp.missing_reasons_count === 0 && comp.open_gaps_count === 0 && (
                        comp.impact_type === "DIRECT_OWNERSHIP" ? (
                          <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded font-bold">
                            Sole Maintainer SPOF (Transfer Pending)
                          </span>
                        ) : (
                          <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded">
                            Documented
                          </span>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Connecting Arrow */}
          <div className="flex items-center justify-center py-1 text-orange-brand">
            <div className="h-6 w-0.5 bg-orange-brand/30"></div>
          </div>

          {/* Level 2: Downstream Ripple / Hidden Cascades */}
          <div className="space-y-3">
            <div className="text-[11px] font-mono text-ink-600 uppercase flex items-center justify-between">
              <span>Downstream Dependent Services (Depth: 1+)</span>
              <span className="text-amber-800 font-bold">{report.downstream_affected_components.length} components</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {report.downstream_affected_components.map((comp) => {
                const isSelected = comp.component_id === selectedCompId;
                return (
                  <div
                    key={comp.component_id}
                    onClick={() => setSelectedCompId(comp.component_id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-cream-50 border-orange-brand shadow-sm ring-2 ring-orange-brand/20'
                        : 'bg-cream-100 border-cream-300 hover:border-cream-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-ink-950">{comp.component_name}</span>
                        <span className="text-[10px] font-mono bg-cream-200 border border-cream-300 px-2 py-0.5 rounded text-ink-700">
                          Cascade Depth: {comp.dependency_depth}
                        </span>
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${getSeverityBadge(comp.severity)}`}>
                        {comp.severity} RISK
                      </span>
                    </div>

                    <div className="text-xs text-ink-700 flex items-center gap-2 mb-2">
                      <span>Owner: {comp.owner_name}</span>
                      <span>•</span>
                      <span className="text-orange-brand font-mono text-[11px]">
                        Path: {comp.direct_dependency_path.join(' → ')}
                      </span>
                    </div>

                    <p className="text-[11px] text-ink-600 leading-snug">
                      {comp.suggested_action}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Diagnostic & Action Inspector */}
        <div className="lg:col-span-5 bg-cream-100 border border-cream-300 rounded-2xl p-5 space-y-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-cream-300">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-ink-600">
              Component Diagnostic Dossier
            </h4>
            <span className="text-[11px] font-mono text-orange-brand font-semibold">
              ID: {selectedComponent.component_id}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-mono uppercase text-ink-600 block">Selected Target:</span>
            <h3 className="text-lg font-bold text-ink-950 font-serif mt-0.5">{selectedComponent.component_name}</h3>
            <div className="flex items-center gap-2 text-xs text-ink-700 mt-1">
              <span>Owner: <strong className="text-ink-900">{selectedComponent.owner_name}</strong></span>
              <span>•</span>
              <span className="font-mono text-orange-brand font-bold">{selectedComponent.impact_type}</span>
            </div>
          </div>

          {/* Diagnostic Evidence Badges */}
          <div className="space-y-2.5">
            <span className="text-[10px] font-mono uppercase text-ink-600 block">Identified Vulnerabilities:</span>

            {selectedComponent.impact_type === "DIRECT_OWNERSHIP" && (
              <div className="bg-amber-50 border border-amber-300 p-3 rounded-xl space-y-1 shadow-xs">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-amber-950 font-bold">Sole Primary Maintainer (SPOF):</span>
                  <span className="font-mono font-bold text-amber-800 text-[10px] bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded">HIGH EXPOSURE</span>
                </div>
                <p className="text-[11px] text-ink-700">
                  Rated HIGH risk because departing member is currently the sole owner. Downstream dependent services will be stranded if ownership and credentials are not transferred.
                </p>
              </div>
            )}
            
            <div className="bg-cream-50 border border-cream-300 p-3 rounded-xl space-y-1 shadow-xs">
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-700">Missing Decision Reasons:</span>
                <span className="font-mono font-bold text-rose-700">{selectedComponent.missing_reasons_count}</span>
              </div>
              <p className="text-[11px] text-ink-600">
                Architectural choices made in commits or Slack without recorded reasons.
              </p>
            </div>

            <div className="bg-cream-50 border border-cream-300 p-3 rounded-xl space-y-1 shadow-xs">
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-700">Open Knowledge Gaps:</span>
                <span className="font-mono font-bold text-amber-700">{selectedComponent.open_gaps_count}</span>
              </div>
              <p className="text-[11px] text-ink-600">
                Implicit operational assumptions flagged by deterministic rules engine.
              </p>
            </div>

            <div className="bg-cream-50 border border-cream-300 p-3 rounded-xl space-y-1 shadow-xs">
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-700">Unresolved Failure Histories:</span>
                <span className="font-mono font-bold text-ink-900">{selectedComponent.unresolved_failures_count}</span>
              </div>
              <p className="text-[11px] text-ink-600">
                Outages or past production fixes needing documented playbooks.
              </p>
            </div>
          </div>

          {/* Action Recommendation Box */}
          <div className="bg-orange-light/50 border border-orange-brand/30 p-4 rounded-xl space-y-2">
            <span className="text-[10px] font-mono font-bold text-orange-brand uppercase tracking-wider block">
              Required Continuity Action:
            </span>
            <p className="text-xs text-ink-800 leading-relaxed font-sans">
              {selectedComponent.suggested_action}
            </p>
          </div>

          {/* Trigger Handover Rehearsal CTA */}
          <button
            onClick={() => {
              if (onInitiateRehearsalForComponent) {
                onInitiateRehearsalForComponent(selectedComponent.component_name);
              }
            }}
            className="w-full bg-orange-brand hover:bg-orange-bright text-cream-50 font-bold text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm shadow-orange-brand/30 transition-all"
          >
            Initiate Handover Rehearsal for {selectedComponent.component_name}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
