import React, { useState } from 'react';
import { 
  GraduationCap, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  Download, 
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Check
} from 'lucide-react';

export interface ReadinessScenario {
  scenario_id: string;
  component_name: string;
  scenario_prompt: string;
  expected_action_checklist: string[];
  critical_evidence_cited: string[];
}

export interface HandoverPacketData {
  project_id: string;
  project_name: string;
  generated_at: string;
  departing_member: string;
  successor_member: string;
  continuity_score: number;
  components: Array<{ name: string; owner: string; source_id: string; status: string }>;
  verified_decisions: Array<{ title: string; reason: string; source_id: string; evidence_quote: string }>;
  resolved_failure_playbooks: Array<{ title: string; error: string; fix: string; resolution: string; source_id: string }>;
  open_attention_items: Array<{ title: string; type: string; description: string }>;
}

interface SuccessorReadinessViewProps {
  scenarios: ReadinessScenario[];
  handoverPacket: HandoverPacketData | null;
  completedScenarios?: Record<string, boolean>;
  onToggleScenario?: (scenarioId: string) => void;
  onCompleteScenario?: (scenarioId: string) => void;
}

export const SuccessorReadinessView: React.FC<SuccessorReadinessViewProps> = ({
  scenarios,
  handoverPacket,
  completedScenarios: controlledCompleted,
  onToggleScenario: controlledToggle,
  onCompleteScenario
}) => {
  const [internalCompleted, setInternalCompleted] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'SCENARIOS' | 'PACKET'>('SCENARIOS');

  const completedMap = controlledCompleted !== undefined ? controlledCompleted : internalCompleted;

  const toggleScenario = (id: string) => {
    if (controlledToggle) {
      controlledToggle(id);
    } else {
      setInternalCompleted(prev => ({
        ...prev,
        [id]: !prev[id]
      }));
    }
  };

  const completedCount = Object.values(completedMap).filter(Boolean).length;
  const readinessPct = scenarios.length > 0 ? Math.round((completedCount / scenarios.length) * 100) : 0;

  const downloadHandoverMarkdown = () => {
    if (!handoverPacket) return;

    const mdContent = `# CAIRN OFFICIAL PROJECT HANDOVER PACKET
**Project:** ${handoverPacket.project_name} (${handoverPacket.project_id})
**Generated At:** ${new Date().toUTCString()}
**Departing Member:** ${handoverPacket.departing_member}
**Designated Successor:** ${handoverPacket.successor_member}
**Continuity Score:** ${handoverPacket.continuity_score} / 100

---

## 1. System Components & Transfer Status
${handoverPacket.components.map(c => `- **${c.name}** | Status: ${c.status} | Owner: ${c.owner} | Source ID: \`${c.source_id}\``).join('\n')}

---

## 2. Verified Architectural Decisions (Zero-Hallucination)
${handoverPacket.verified_decisions.map(d => `### ${d.title}
- **Status:** EVIDENCE_SUPPORTED
- **Verified Reason:** ${d.reason}
- **Cited Source:** \`${d.source_id}\`
- **Verbatim Excerpt:** _"${d.evidence_quote}"_
`).join('\n')}

---

## 3. Explainable Failure Troubleshooting Playbooks
${handoverPacket.resolved_failure_playbooks.map(f => `### Incident: ${f.title}
- **Observed Error:** \`${f.error}\`
- **Root-Cause Fix:** ${f.fix}
- **Resolution Status:** ${f.resolution}
- **Source ID:** \`${f.source_id}\`
`).join('\n')}

---

## 4. Open Attention Items & Hidden Dependencies
${handoverPacket.open_attention_items.map(a => `- **[${a.type}] ${a.title}:** ${a.description}`).join('\n')}

---
*Signed and sealed by Cairn Project Continuity Intelligence Platform*
`;

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${handoverPacket.project_id}-handover-packet.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-cream-50 border border-cream-300 rounded-2xl p-6 shadow-warm text-ink-900">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-cream-300 gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-light border border-orange-brand/30 text-orange-brand text-xs font-semibold mb-2">
            <GraduationCap className="w-3.5 h-3.5" /> Stage 8: Handover & Successor Readiness
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-ink-950 font-serif">Successor Readiness Workspace</h2>
          <p className="text-xs text-ink-700 mt-1 max-w-2xl leading-relaxed">
            Verify the successor's operational readiness on simulated incident scenarios before final sign-off, 
            and inspect the official evidence-backed Handover Packet.
          </p>
        </div>

        {/* Readiness Meter */}
        <div className="flex items-center gap-4 bg-cream-100 p-3 px-5 rounded-2xl border border-cream-300 shadow-xs">
          <div>
            <span className="text-[10px] font-mono text-ink-600 uppercase block font-semibold">READINESS DRILL SCORE</span>
            <span className="text-xl font-black font-mono text-orange-brand">{readinessPct}%</span>
          </div>
          <div className="w-20 bg-cream-300 rounded-full h-2.5 overflow-hidden">
            <div 
              className="bg-orange-brand h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${readinessPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-cream-300 space-x-6 my-6 text-xs font-bold">
        <button
          onClick={() => setActiveTab('SCENARIOS')}
          className={`pb-2.5 transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'SCENARIOS'
              ? 'border-orange-brand text-orange-brand'
              : 'border-transparent text-ink-600 hover:text-ink-950'
          }`}
        >
          <GraduationCap className="w-4 h-4" /> Operational Scenario Drills ({completedCount}/{scenarios.length})
        </button>
        <button
          onClick={() => setActiveTab('PACKET')}
          className={`pb-2.5 transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'PACKET'
              ? 'border-orange-brand text-orange-brand'
              : 'border-transparent text-ink-600 hover:text-ink-950'
          }`}
        >
          <FileText className="w-4 h-4" /> Official Handover Packet Brief
        </button>
      </div>

      {/* Tab 1: Scenarios */}
      {activeTab === 'SCENARIOS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {scenarios.map((scen) => {
            const isDone = !!completedMap[scen.scenario_id];
            return (
              <div 
                key={scen.scenario_id}
                className={`p-5 rounded-2xl border transition-all ${
                  isDone 
                    ? 'bg-cream-100 border-orange-brand/50 shadow-sm ring-1 ring-orange-brand/20' 
                    : 'bg-cream-100 border-cream-300 hover:border-cream-400'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <span className="text-[10px] font-mono text-orange-brand uppercase tracking-wider block font-bold">
                      Target: {scen.component_name}
                    </span>
                    <h4 className="text-sm font-bold text-ink-950 mt-0.5 font-sans">{scen.scenario_prompt}</h4>
                  </div>
                  <button
                    onClick={() => toggleScenario(scen.scenario_id)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all ${
                      isDone
                        ? 'bg-orange-brand border-orange-brand text-cream-50 font-bold'
                        : 'bg-cream-50 border-cream-300 text-ink-600 hover:border-orange-brand'
                    }`}
                  >
                    {isDone ? <Check className="w-4 h-4 stroke-[3]" /> : <CheckCircle2 className="w-4 h-4" />}
                  </button>
                </div>

                <div className="space-y-1.5 mt-3 pt-3 border-t border-cream-300 text-xs">
                  <span className="text-[10px] font-mono text-ink-600 uppercase block mb-1 font-semibold">
                    Verified Checklist:
                  </span>
                  {scen.expected_action_checklist.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-ink-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-brand flex-shrink-0" />
                      <span>{step}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-2 border-t border-cream-300 flex items-center justify-between text-[10px] font-mono text-ink-600">
                  <span>EVIDENCE CITED: {scen.critical_evidence_cited[0]?.slice(0, 12)}...</span>
                  <span className={isDone ? 'text-orange-brand font-bold' : 'text-ink-500'}>
                    {isDone ? 'DRILL COMPLETED' : 'PENDING SIMULATION'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 2: Handover Packet Export */}
      {activeTab === 'PACKET' && handoverPacket && (
        <div className="bg-cream-100 border border-cream-300 rounded-2xl p-6 space-y-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-cream-300 pb-4">
            <div>
              <span className="text-[10px] font-mono text-orange-brand uppercase font-bold">OFFICIAL PROJECT HANDOVER</span>
              <h3 className="text-xl font-bold text-ink-950 font-serif">{handoverPacket.project_name}</h3>
              <p className="text-xs text-ink-600 mt-0.5">
                From <span className="text-ink-900 font-semibold">{handoverPacket.departing_member}</span> to <span className="text-ink-900 font-semibold">{handoverPacket.successor_member}</span>
              </p>
            </div>
            <button 
              onClick={downloadHandoverMarkdown}
              className="bg-orange-brand hover:bg-orange-bright text-cream-50 font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm flex items-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" /> Export Handover Archive (.md)
            </button>
          </div>

          {/* Verified Decisions */}
          <div>
            <h4 className="text-xs font-mono font-bold uppercase text-ink-800 mb-3 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Verified Architectural Decisions
            </h4>
            <div className="space-y-2">
              {handoverPacket.verified_decisions.map((d, i) => (
                <div key={i} className="bg-cream-50 border border-cream-300 p-3.5 rounded-xl text-xs space-y-1 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-ink-950">{d.title}</span>
                    <span className="text-[10px] font-mono text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 font-bold">
                      EVIDENCE SUPPORTED
                    </span>
                  </div>
                  <p className="text-ink-600">Reason: <span className="text-ink-900 font-medium">{d.reason}</span></p>
                </div>
              ))}
            </div>
          </div>

          {/* Explainable Failure Playbooks */}
          <div>
            <h4 className="text-xs font-mono font-bold uppercase text-ink-800 mb-3 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-orange-brand" /> Explainable Failure Troubleshooting History
            </h4>
            <div className="space-y-2">
              {handoverPacket.resolved_failure_playbooks.map((f, i) => (
                <div key={i} className="bg-cream-50 border border-cream-300 p-3.5 rounded-xl text-xs space-y-1.5 shadow-xs">
                  <span className="font-bold text-ink-950 block">{f.title}</span>
                  <p className="text-rose-800 font-mono text-[11px]">Error: {f.error}</p>
                  <p className="text-emerald-800 font-mono text-[11px]">Fix: {f.fix}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
