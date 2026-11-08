import React, { useState, useEffect } from 'react';
import { ContinuityScoreWidget, ScoreBreakdown } from './components/ContinuityScoreWidget';
import { ContinuityStressTestView, StressTestReport } from './components/ContinuityStressTestView';
import { HandoverRehearsalChat, RehearsalExchange, UserRole } from './components/HandoverRehearsalChat';
import { SuccessorReadinessView, ReadinessScenario, HandoverPacketData } from './components/SuccessorReadinessView';
import { IngestionModal } from './components/IngestionModal';
import { KnowledgeModelExplorer } from './components/KnowledgeModelExplorer';
import { DepartingMemberWorkspace } from './components/DepartingMemberWorkspace';
import { 
  fetchProjectScore, 
  fetchStressTest, 
  fetchRehearsalQuestions, 
  askRehearsalQuestion, 
  replyRehearsalQuestion, 
  reviewRehearsalQuestion,
  fetchReadinessScenarios,
  fetchHandoverPacket
} from './api/client';
import { 
  Compass, 
  ShieldCheck, 
  Zap, 
  Layers, 
  GraduationCap, 
  Users, 
  ArrowRight, 
  CheckCircle2, 
  Sparkles,
  RefreshCw,
  FileUp,
  MessageSquare,
  FileText,
  UserMinus,
  CheckSquare,
  HelpCircle,
  Activity,
  FolderGit2,
  Calendar,
  AlertTriangle,
  GitCommit,
  ArrowUpRight,
  Clock,
  ShieldAlert,
  ChevronRight,
  TrendingUp,
  Check
} from 'lucide-react';

// ==========================================
// FALLBACK DATA GROUNDED IN SLIDE DEMO
// ==========================================
const FALLBACK_SCORE: ScoreBreakdown = {
  overall_score: 54.67,
  evidence_coverage_score: 26.0,
  ownership_clarity_score: 6.67,
  dependency_doc_score: 10.0,
  gap_penalty_score: 12.0,
  metrics: {
    total_components: 3,
    total_decisions: 2,
    evidence_supported_decisions: 1,
    reason_missing_decisions: 1,
    total_dependencies: 2,
    hidden_dependencies_count: 1,
    open_knowledge_gaps: 2,
    resolved_knowledge_gaps: 0
  }
};

const FALLBACK_STRESS: StressTestReport = {
  project_id: "proj-cairn-mvp",
  departing_member_id: "usr-dev-a",
  departing_member_name: "Departing Member",
  total_components_analyzed: 3,
  directly_affected_components: [
    {
      component_id: "comp-auth-api",
      component_name: "Authentication Service",
      owner_id: "usr-dev-a",
      owner_name: "Departing Member",
      impact_type: "DIRECT_OWNERSHIP",
      severity: "HIGH",
      dependency_depth: 0,
      direct_dependency_path: ["Authentication Service"],
      missing_reasons_count: 0,
      open_gaps_count: 0,
      unresolved_failures_count: 0,
      suggested_action: "Transfer primary ownership and verify deployment credentials."
    },
    {
      component_id: "comp-payment-retry",
      component_name: "Payment Retry Worker",
      owner_id: "usr-dev-a",
      owner_name: "Departing Member",
      impact_type: "DIRECT_OWNERSHIP",
      severity: "HIGH",
      dependency_depth: 0,
      direct_dependency_path: ["Payment Retry Worker"],
      missing_reasons_count: 1,
      open_gaps_count: 1,
      unresolved_failures_count: 0,
      suggested_action: "Assign replacement owner and schedule Handover Rehearsal. Resolve 1 undocumented decision(s) and 1 open gap(s)."
    }
  ],
  downstream_affected_components: [
    {
      component_id: "comp-dashboard",
      component_name: "Analytics Dashboard",
      owner_id: "usr-dev-c",
      owner_name: "Frontend Lead",
      impact_type: "DOWNSTREAM_DEPENDENCY",
      severity: "HIGH",
      dependency_depth: 1,
      direct_dependency_path: ["Authentication Service", "Analytics Dashboard"],
      missing_reasons_count: 0,
      open_gaps_count: 1,
      unresolved_failures_count: 0,
      suggested_action: "URGENT: Verify hidden connection from Analytics Dashboard to Authentication Service. Owner Frontend Lead needs API contract."
    }
  ],
  single_points_of_failure: ["Authentication Service"],
  summary: {
    direct_count: 2,
    downstream_count: 1,
    critical_single_points_count: 1,
    max_cascade_depth: 1
  }
};

const FALLBACK_EXCHANGES: RehearsalExchange[] = [
  {
    id: "ex-initial-01",
    project_id: "proj-cairn-mvp",
    requester_name: "Successor Member",
    question: "Why did we decide to use PostgreSQL instead of MongoDB?",
    status: "ANSWERED_FROM_EVIDENCE",
    evidence_answer: "Verified Record: Use PostgreSQL for Financial Ledger. Reason: Relational transactions and strict ACID compliance needed for ledger auditing (Excerpt: 'Meeting notes: Relational transactions non-negotiable for billing.')",
    cited_source_ids: ["src-doc-arch-01"],
    created_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: "ex-initial-02",
    project_id: "proj-cairn-mvp",
    requester_name: "Successor Member",
    question: "Why is the payment retry limit set to 3?",
    status: "PENDING_DEPARTING_REPLY",
    evidence_answer: null,
    cited_source_ids: [],
    created_at: new Date(Date.now() - 1800000).toISOString()
  }
];

type NavView = 'OVERVIEW' | 'STRESS_TEST' | 'REHEARSAL' | 'KNOWLEDGE' | 'DEPARTING_QUEUE' | 'READINESS';

export const CairnWorkspace: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<UserRole>('INCOMING_MEMBER');
  const [activeView, setActiveView] = useState<NavView>('OVERVIEW');
  const [isIngestOpen, setIsIngestOpen] = useState(false);
  const [scoreData, setScoreData] = useState<ScoreBreakdown>(FALLBACK_SCORE);
  const [stressReport, setStressReport] = useState<StressTestReport>(FALLBACK_STRESS);
  const [exchanges, setExchanges] = useState<RehearsalExchange[]>(FALLBACK_EXCHANGES);
  const [scenarios, setScenarios] = useState<ReadinessScenario[]>([]);
  const [handoverPacket, setHandoverPacket] = useState<HandoverPacketData | null>(null);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [quickQuestionInput, setQuickQuestionInput] = useState('');

  const PROJECT_ID = "proj-cairn-mvp";
  const USER_IDS: Record<UserRole, string> = {
    MANAGER: "usr-mgr-01",
    DEPARTING_MEMBER: "usr-dev-a",
    INCOMING_MEMBER: "usr-dev-b"
  };

  const loadLiveData = async () => {
    try {
      const uid = USER_IDS[currentRole];
      const [scoreRes, stressRes, questionsRes, scenRes, packetRes] = await Promise.allSettled([
        fetchProjectScore(PROJECT_ID, uid),
        fetchStressTest(PROJECT_ID, uid),
        fetchRehearsalQuestions(PROJECT_ID, uid),
        fetchReadinessScenarios(PROJECT_ID, uid),
        fetchHandoverPacket(PROJECT_ID, uid)
      ]);

      if (scoreRes.status === 'fulfilled') {
        setScoreData(scoreRes.value);
        setIsLiveConnected(true);
      }
      if (stressRes.status === 'fulfilled') setStressReport(stressRes.value);
      if (questionsRes.status === 'fulfilled' && questionsRes.value.length > 0) {
        setExchanges(questionsRes.value.map((q: any) => ({
          id: q.id,
          project_id: q.project_id,
          requester_name: "Successor Member",
          question: q.question,
          status: q.status,
          evidence_answer: q.evidence_answer,
          cited_source_ids: q.cited_source_ids,
          departing_reply: q.departing_reply,
          manager_review_comment: q.manager_review_comment,
          approved_source_document_id: q.approved_source_document_id,
          created_at: q.created_at
        })));
      }
      if (scenRes.status === 'fulfilled') setScenarios(scenRes.value);
      if (packetRes.status === 'fulfilled') setHandoverPacket(packetRes.value);
    } catch (e) {
      console.warn("Backend sync", e);
      setIsLiveConnected(false);
    }
  };

  useEffect(() => {
    loadLiveData();
  }, [currentRole]);

  // Handle Asking Question
  const handleAskQuestion = async (questionText: string) => {
    try {
      const uid = USER_IDS[currentRole];
      const res = await askRehearsalQuestion(PROJECT_ID, questionText, uid);
      const newEx: RehearsalExchange = {
        id: res.rehearsal_question_id,
        project_id: PROJECT_ID,
        requester_name: "Successor Member",
        question: questionText,
        status: res.status,
        evidence_answer: res.evidence_answer,
        cited_source_ids: res.cited_source_ids,
        created_at: new Date().toISOString()
      };
      setExchanges(prev => [newEx, ...prev]);
    } catch (err) {
      if (questionText.toLowerCase().includes("postgres")) {
        setExchanges(prev => [{
          id: `ex-${Date.now()}`,
          project_id: PROJECT_ID,
          requester_name: "Successor Member",
          question: questionText,
          status: "ANSWERED_FROM_EVIDENCE",
          evidence_answer: "Verified Record: Use PostgreSQL for Financial Ledger. Reason: Relational transactions and strict ACID compliance needed for ledger auditing.",
          cited_source_ids: ["src-doc-arch-01"],
          created_at: new Date().toISOString()
        }, ...prev]);
      } else {
        setExchanges(prev => [{
          id: `ex-${Date.now()}`,
          project_id: PROJECT_ID,
          requester_name: "Successor Member",
          question: questionText,
          status: "PENDING_DEPARTING_REPLY",
          evidence_answer: null,
          cited_source_ids: [],
          created_at: new Date().toISOString()
        }, ...prev]);
      }
    }
  };

  // Handle Departing Member Reply
  const handleReplyQuestion = async (questionId: string, replyText: string) => {
    try {
      const uid = USER_IDS[currentRole];
      await replyRehearsalQuestion(questionId, replyText, uid);
    } catch (e) {
      console.warn("Live reply sync", e);
    }
    setExchanges(prev => prev.map(item => {
      if (item.id === questionId) {
        return {
          ...item,
          status: 'pending_review',
          departing_reply: replyText
        };
      }
      return item;
    }));
  };

  // Handle Manager Review & Sign-Off
  const handleReviewQuestion = async (questionId: string, approved: boolean, comment?: string) => {
    try {
      const uid = USER_IDS[currentRole];
      await reviewRehearsalQuestion(questionId, approved, comment, uid);
    } catch (e) {
      console.warn("Live review sync", e);
    }
    setExchanges(prev => prev.map(item => {
      if (item.id === questionId) {
        return {
          ...item,
          status: approved ? 'APPROVED_AS_EVIDENCE' : 'REJECTED',
          manager_review_comment: comment || (approved ? 'Approved by Manager' : 'Rejected'),
          approved_source_document_id: approved ? `src-doc-rehearsal-${Date.now()}` : null
        };
      }
      return item;
    }));

    if (approved) {
      setScoreData(prev => ({
        ...prev,
        overall_score: Math.min(100, prev.overall_score + 18.0),
        evidence_coverage_score: Math.min(40, prev.evidence_coverage_score + 14.0),
        gap_penalty_score: Math.min(20, prev.gap_penalty_score + 4.0),
        metrics: {
          ...prev.metrics,
          open_knowledge_gaps: Math.max(0, prev.metrics.open_knowledge_gaps - 1),
          resolved_knowledge_gaps: prev.metrics.resolved_knowledge_gaps + 1,
          reason_missing_decisions: Math.max(0, prev.metrics.reason_missing_decisions - 1),
          evidence_supported_decisions: prev.metrics.evidence_supported_decisions + 1
        }
      }));
    }
  };

  const WORKFLOW_STAGES = [
    { num: 1, name: "Connect" },
    { num: 2, name: "Reconstruct" },
    { num: 3, name: "Detect" },
    { num: 4, name: "Stress Test" },
    { num: 5, name: "Verify" },
    { num: 6, name: "Rehearsal" },
    { num: 7, name: "Review" },
    { num: 8, name: "Handover" }
  ];

  return (
    <div className="flex w-full h-screen bg-cream-200 text-ink-900 overflow-hidden font-sans">
      {/* ========================================================= */}
      {/* 1. LEFT SIDEBAR: Deep Obsidian Ink Rail (Grounds the Eye)  */}
      {/* ========================================================= */}
      <aside className="w-64 flex-shrink-0 bg-ink-900 border-r border-ink-850 flex flex-col justify-between z-20 text-cream-100 shadow-warm-lg">
        <div>
          {/* Brand Header */}
          <div className="p-5 border-b border-ink-850 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-brand flex items-center justify-center shadow-md shadow-orange-brand/30">
              <Compass className="w-5 h-5 text-cream-50" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-bold text-base tracking-tight text-cream-50 font-serif">Cairn</h1>
                <span className="text-[9px] font-mono font-bold bg-orange-bright/20 text-orange-bright border border-orange-bright/40 px-1.5 py-0.2 rounded">
                  2.0
                </span>
              </div>
              <p className="text-[11px] text-cream-400">Continuity Intelligence</p>
            </div>
          </div>

          {/* Project Boundary Card (MVP Scope Lock) */}
          <div className="p-3.5 m-3 bg-ink-950/80 border border-ink-800 rounded-xl space-y-1 shadow-inner">
            <div className="flex items-center justify-between text-[10px] font-mono text-cream-400">
              <span className="flex items-center gap-1 text-cream-300 font-semibold">
                <FolderGit2 className="w-3.5 h-3.5 text-orange-bright" /> BOUNDARY LOCK
              </span>
              <span className="text-orange-bright font-bold">1 PROJECT</span>
            </div>
            <p className="text-xs font-bold text-cream-50 truncate">FinTrack Core Ledger</p>
            <p className="text-[11px] text-cream-400 truncate">Leaving: Departing Member</p>
          </div>

          {/* Role Switcher Pill Box */}
          <div className="px-3.5 py-2">
            <label className="text-[10px] font-mono text-cream-400 uppercase tracking-wider block mb-1.5 font-semibold">
              Simulate Persona:
            </label>
            <div className="grid grid-cols-1 gap-1 bg-ink-950 p-1 rounded-xl border border-ink-800 text-xs shadow-inner">
              <button
                onClick={() => { setCurrentRole('INCOMING_MEMBER'); setActiveView('OVERVIEW'); }}
                className={`text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                  currentRole === 'INCOMING_MEMBER' 
                    ? 'bg-orange-brand text-cream-50 font-bold shadow-sm' 
                    : 'text-cream-300 hover:text-cream-50 hover:bg-ink-850'
                }`}
              >
                <span>Successor Member</span>
                {currentRole === 'INCOMING_MEMBER' && <CheckCircle2 className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => { setCurrentRole('DEPARTING_MEMBER'); setActiveView('DEPARTING_QUEUE'); }}
                className={`text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                  currentRole === 'DEPARTING_MEMBER' 
                    ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40 font-bold' 
                    : 'text-cream-300 hover:text-cream-50 hover:bg-ink-850'
                }`}
              >
                <span>Departing Member</span>
                {currentRole === 'DEPARTING_MEMBER' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-300" />}
              </button>
              <button
                onClick={() => { setCurrentRole('MANAGER'); setActiveView('OVERVIEW'); }}
                className={`text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                  currentRole === 'MANAGER' 
                    ? 'bg-purple-900/40 text-purple-200 border border-purple-500/40 font-bold' 
                    : 'text-cream-300 hover:text-cream-50 hover:bg-ink-850'
                }`}
              >
                <span>Engineering Manager</span>
                {currentRole === 'MANAGER' && <CheckCircle2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            <button
              onClick={() => setActiveView('OVERVIEW')}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-colors ${
                activeView === 'OVERVIEW' 
                  ? 'bg-ink-800 text-cream-50 font-bold border-l-4 border-l-orange-brand shadow-sm' 
                  : 'text-cream-300 hover:text-cream-50 hover:bg-ink-850/60'
              }`}
            >
              <Activity className="w-4 h-4 text-orange-bright" />
              <span>Continuity Control Tower</span>
            </button>

            <button
              onClick={() => setActiveView('STRESS_TEST')}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-colors ${
                activeView === 'STRESS_TEST' 
                  ? 'bg-ink-800 text-cream-50 font-bold border-l-4 border-l-orange-brand shadow-sm' 
                  : 'text-cream-300 hover:text-cream-50 hover:bg-ink-850/60'
              }`}
            >
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Absence Stress Test</span>
            </button>

            <button
              onClick={() => setActiveView('REHEARSAL')}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                activeView === 'REHEARSAL' 
                  ? 'bg-ink-800 text-cream-50 font-bold border-l-4 border-l-orange-brand shadow-sm' 
                  : 'text-cream-300 hover:text-cream-50 hover:bg-ink-850/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <MessageSquare className="w-4 h-4 text-orange-bright" />
                <span>Handover Rehearsal Q&A</span>
              </div>
              <span className="text-[10px] font-mono bg-ink-950 px-1.5 py-0.5 rounded text-cream-300 font-semibold">
                {exchanges.length}
              </span>
            </button>

            {/* Role Dedicated Workspace */}
            {currentRole === 'DEPARTING_MEMBER' ? (
              <button
                onClick={() => setActiveView('DEPARTING_QUEUE')}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition-colors ${
                  activeView === 'DEPARTING_QUEUE' 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 border-l-4 border-l-amber-500' 
                    : 'text-amber-400 hover:bg-amber-500/10'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <UserMinus className="w-4 h-4" />
                  <span>My Handover Queue</span>
                </div>
                <span className="text-[10px] font-mono bg-amber-500 text-ink-950 font-bold px-1.5 py-0.2 rounded-full">
                  Action
                </span>
              </button>
            ) : (
              <button
                onClick={() => setActiveView('KNOWLEDGE')}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-colors ${
                  activeView === 'KNOWLEDGE' 
                    ? 'bg-ink-800 text-cream-50 font-bold border-l-4 border-l-orange-brand shadow-sm' 
                    : 'text-cream-300 hover:text-cream-50 hover:bg-ink-850/60'
                }`}
              >
                <Layers className="w-4 h-4 text-orange-bright" />
                <span>Knowledge Model Explorer</span>
              </button>
            )}

            <button
              onClick={() => setActiveView('READINESS')}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-colors ${
                activeView === 'READINESS' 
                  ? 'bg-ink-800 text-cream-50 font-bold border-l-4 border-l-orange-brand shadow-sm' 
                  : 'text-cream-300 hover:text-cream-50 hover:bg-ink-850/60'
              }`}
            >
              <GraduationCap className="w-4 h-4 text-cream-300" />
              <span>Successor Readiness</span>
            </button>
          </nav>
        </div>

        {/* Ingest Action & Footer */}
        <div className="p-4 border-t border-ink-850 space-y-3 bg-ink-950/60">
          <button
            onClick={() => setIsIngestOpen(true)}
            className="w-full bg-orange-brand hover:bg-orange-bright text-cream-50 font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 shadow-md shadow-orange-brand/30 transition-all"
          >
            <FileUp className="w-4 h-4" /> Ingest Source / Commit
          </button>

          <div className="flex items-center justify-between text-[11px] font-mono text-cream-400 pt-1">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isLiveConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {isLiveConnected ? 'API Live' : 'Local Fallback'}
            </span>
            <span>v1.0.0</span>
          </div>
        </div>
      </aside>

      {/* ========================================================= */}
      {/* 2. MAIN CENTERED CONTENT WORKSPACE (Warm Linen Backdrop)  */}
      {/* ========================================================= */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto bg-cream-200">
        {/* Top Centered Header Bar */}
        <header className="border-b border-cream-300 bg-cream-100/95 sticky top-0 z-10 backdrop-blur-md px-8 py-3.5 flex items-center justify-between shadow-warm-sm">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-ink-950 font-serif capitalize">
              {activeView === 'OVERVIEW' && 'Continuity Overview & Diagnostic Breakdown'}
              {activeView === 'STRESS_TEST' && 'Continuity Stress Test (Controlled Departure)'}
              {activeView === 'REHEARSAL' && 'Handover Rehearsal Dialogue'}
              {activeView === 'KNOWLEDGE' && 'Structured Project Knowledge Model'}
              {activeView === 'DEPARTING_QUEUE' && 'Departing Member Knowledge Capture Queue'}
              {activeView === 'READINESS' && 'Successor Readiness Drills & Handover Export'}
            </h2>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="text-ink-600 hidden sm:inline">Score:</span>
            <span className="bg-orange-light border border-orange-brand/30 text-orange-brand px-3 py-1 rounded-full font-bold shadow-warm-sm">
              {scoreData.overall_score} / 100
            </span>

            <button 
              onClick={loadLiveData}
              className="text-ink-600 hover:text-ink-950 p-1.5 rounded-lg hover:bg-cream-200 transition-colors border border-cream-300"
              title="Refresh live metrics from backend"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* 8-Stage Workflow Bar (Slide 3) */}
        <div className="border-b border-cream-300 bg-cream-100 px-8 py-2">
          <div className="max-w-6xl mx-auto flex items-center justify-between text-[11px] font-mono text-ink-700">
            {WORKFLOW_STAGES.map((s, idx) => (
              <React.Fragment key={s.num}>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-cream-50 border border-cream-300 text-ink-900 flex items-center justify-center text-[9px] font-bold shadow-warm-sm">
                    {s.num}
                  </span>
                  <span className="font-semibold text-ink-800">{s.name}</span>
                </div>
                {idx < WORKFLOW_STAGES.length - 1 && (
                  <ArrowRight className="w-3 h-3 text-cream-400 flex-shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content Container (Dense, Informative, Grounded) */}
        <div className="max-w-6xl w-full mx-auto p-8 space-y-7">
          {activeView === 'OVERVIEW' && (
            <>
              {/* Executive Handover Status & Countdown Banner */}
              <div className="bg-gradient-to-r from-cream-50 via-cream-100 to-orange-warm border border-cream-300 rounded-2xl p-5 shadow-warm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-2xl bg-orange-brand text-cream-50 flex items-center justify-center flex-shrink-0 shadow-md shadow-orange-brand/20">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                        HANDOVER STATUS: AMBER (ACTION REQUIRED)
                      </span>
                      <span className="text-[11px] font-mono text-ink-600">Project ID: {PROJECT_ID}</span>
                    </div>
                    <h3 className="text-base font-bold text-ink-950 font-serif">
                      FinTrack Core Banking Ledger — Scheduled Departure in 14 Days
                    </h3>
                    <p className="text-xs text-ink-700 mt-0.5">
                      Departing Architect: <strong className="text-ink-950">Departing Member</strong> ➔ Primary Successor: <strong className="text-ink-950">Successor Member</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveView('STRESS_TEST')}
                    className="bg-orange-brand hover:bg-orange-bright text-cream-50 font-bold text-xs px-4 py-2.5 rounded-xl shadow-warm-sm flex items-center gap-1.5 transition-all whitespace-nowrap"
                  >
                    Simulate Absence <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 4 High-Impact Diagnostic Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-cream-50 border border-cream-300 rounded-2xl p-4 shadow-warm space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono text-ink-600">
                    <span>CONTINUITY INDEX</span>
                    <TrendingUp className="w-3.5 h-3.5 text-orange-brand" />
                  </div>
                  <div className="text-2xl font-black font-mono text-ink-950">{scoreData.overall_score} <span className="text-xs font-normal text-ink-500">/ 100</span></div>
                  <p className="text-[11px] text-ink-600">+18.0 pts upon resolving remaining gaps</p>
                </div>

                <div className="bg-cream-50 border border-cream-300 rounded-2xl p-4 shadow-warm space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono text-ink-600">
                    <span>STRANDED SPOFs</span>
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  </div>
                  <div className="text-2xl font-black font-mono text-rose-700">2 <span className="text-xs font-normal text-ink-500">Components</span></div>
                  <p className="text-[11px] text-ink-600">Auth Service, Payment Retry Worker</p>
                </div>

                <div className="bg-cream-50 border border-cream-300 rounded-2xl p-4 shadow-warm space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono text-ink-600">
                    <span>UNRESOLVED GAPS</span>
                    <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <div className="text-2xl font-black font-mono text-amber-700">2 <span className="text-xs font-normal text-ink-500">Critical</span></div>
                  <p className="text-[11px] text-ink-600">1 Missing Reason, 1 Hidden Dependency</p>
                </div>

                <div className="bg-cream-50 border border-cream-300 rounded-2xl p-4 shadow-warm space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono text-ink-600">
                    <span>DRILL READINESS</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-black font-mono text-emerald-800">50% <span className="text-xs font-normal text-ink-500">Pass Rate</span></div>
                  <p className="text-[11px] text-ink-600">1 of 2 incident simulations approved</p>
                </div>
              </div>

              {/* Radial Score Gauge Widget */}
              <ContinuityScoreWidget scoreData={scoreData} onRefresh={loadLiveData} />

              {/* Dense Two-Column Intelligence Section */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column (7 cols): Blast Radius & Attention Blockers */}
                <div className="lg:col-span-7 space-y-6">
                  {/* Card A: Absence Blast Radius Flowchart Preview */}
                  <div className="bg-cream-50 border border-cream-300 rounded-2xl p-6 shadow-warm space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-orange-brand" />
                        <h4 className="font-bold text-sm text-ink-950 font-serif">
                          Absence Blast Radius Flowchart Preview
                        </h4>
                      </div>
                      <button
                        onClick={() => setActiveView('STRESS_TEST')}
                        className="text-xs font-mono font-bold text-orange-brand hover:text-orange-bright flex items-center gap-1"
                      >
                        Inspect Full Graph <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="text-xs text-ink-700 leading-relaxed">
                      Relational BFS trace indicates that the Departing Member's departure directly isolates 2 primary components 
                      and causes cascading contract risks on downstream client dashboards.
                    </p>

                    {/* Mini Flow Diagram */}
                    <div className="bg-cream-100 border border-cream-300 rounded-xl p-4 space-y-3 shadow-inner">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-orange-brand" />
                        <span className="text-xs font-bold font-mono text-ink-950">Departing Member (Absent)</span>
                      </div>

                      <div className="pl-4 ml-1 border-l-2 border-dashed border-orange-brand/40 space-y-2 text-xs">
                        <div className="flex items-center justify-between bg-cream-50 p-2.5 rounded-lg border border-cream-300 shadow-warm-sm">
                          <div>
                            <span className="font-bold text-ink-950">Authentication Service</span>
                            <span className="text-[10px] text-ink-500 block font-mono">Direct Ownership (SPOF)</span>
                          </div>
                          <span className="text-[10px] font-mono bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 rounded font-bold">
                            HIGH RISK
                          </span>
                        </div>

                        <div className="flex items-center justify-between bg-cream-50 p-2.5 rounded-lg border border-cream-300 shadow-warm-sm">
                          <div>
                            <span className="font-bold text-ink-950">Payment Retry Worker</span>
                            <span className="text-[10px] text-rose-700 block font-mono">Missing Reason on Commit 88f2a1</span>
                          </div>
                          <span className="text-[10px] font-mono bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded font-bold">
                            KNOWLEDGE GAP
                          </span>
                        </div>

                        <div className="flex items-center justify-between bg-orange-light/40 p-2.5 rounded-lg border border-orange-brand/30 shadow-warm-sm">
                          <div>
                            <span className="font-bold text-ink-950">Analytics Dashboard (Owner: Dev C)</span>
                            <span className="text-[10px] text-orange-brand block font-mono">Hidden API Dependency (Cascade Depth: 1)</span>
                          </div>
                          <span className="text-[10px] font-mono bg-orange-brand text-cream-50 px-2 py-0.5 rounded font-bold">
                            DOWNSTREAM
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card B: Critical Attention Queue (Top 3 items blocking sign-off) */}
                  <div className="bg-cream-50 border border-cream-300 rounded-2xl p-6 shadow-warm space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-rose-700" />
                        <h4 className="font-bold text-sm text-ink-950 font-serif">
                          Critical Attention Queue (Blocking Handover)
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 rounded font-bold">
                        3 Actions Needed
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div className="p-3 bg-cream-100 border border-cream-300 rounded-xl flex items-center justify-between text-xs shadow-warm-sm">
                        <div className="space-y-0.5">
                          <span className="font-bold text-ink-950 block">Resolve Payment Retry Limit Rationale</span>
                          <span className="text-[11px] text-ink-600">Commit 88f2a1 lacks architectural rationale in code review notes.</span>
                        </div>
                        <button
                          onClick={() => { setCurrentRole('DEPARTING_MEMBER'); setActiveView('DEPARTING_QUEUE'); }}
                          className="text-[11px] font-mono font-bold bg-cream-50 hover:bg-cream-200 border border-cream-300 px-3 py-1.5 rounded-lg text-ink-900 transition-colors shadow-warm-sm"
                        >
                          Resolve
                        </button>
                      </div>

                      <div className="p-3 bg-cream-100 border border-cream-300 rounded-xl flex items-center justify-between text-xs shadow-warm-sm">
                        <div className="space-y-0.5">
                          <span className="font-bold text-ink-950 block">Document Hidden Contract: Analytics ➔ Auth</span>
                          <span className="text-[11px] text-ink-600">Frontend Lead relies on private session token endpoint without API spec.</span>
                        </div>
                        <button
                          onClick={() => setActiveView('REHEARSAL')}
                          className="text-[11px] font-mono font-bold bg-cream-50 hover:bg-cream-200 border border-cream-300 px-3 py-1.5 rounded-lg text-ink-900 transition-colors shadow-warm-sm"
                        >
                          Query
                        </button>
                      </div>

                      <div className="p-3 bg-cream-100 border border-cream-300 rounded-xl flex items-center justify-between text-xs shadow-warm-sm">
                        <div className="space-y-0.5">
                          <span className="font-bold text-ink-950 block">Assign Successor Co-Maintainer to Auth API</span>
                          <span className="text-[11px] text-ink-600">Transfer root deployment credentials and IAM role before final sign-off.</span>
                        </div>
                        <button
                          onClick={() => setActiveView('READINESS')}
                          className="text-[11px] font-mono font-bold bg-cream-50 hover:bg-cream-200 border border-cream-300 px-3 py-1.5 rounded-lg text-ink-900 transition-colors shadow-warm-sm"
                        >
                          Verify
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column (5 cols): Rehearsal Sandbox & Live Activity */}
                <div className="lg:col-span-5 space-y-6">
                  {/* Card C: Handover Rehearsal Quick Sandbox */}
                  <div className="bg-cream-50 border border-cream-300 rounded-2xl p-6 shadow-warm space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-orange-brand" />
                        <h4 className="font-bold text-sm text-ink-950 font-serif">
                          Rehearsal Quick Query Sandbox
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono bg-orange-light text-orange-brand border border-orange-brand/30 px-2 py-0.5 rounded font-bold">
                        Zero-Hallucination
                      </span>
                    </div>

                    <p className="text-xs text-ink-700 leading-relaxed">
                      Test successor questions directly. If approved documentation cannot verify the answer, 
                      Cairn refuses to guess and queues it for the departing member.
                    </p>

                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Ask a question (e.g. Why PostgreSQL?)..."
                          value={quickQuestionInput}
                          onChange={(e) => setQuickQuestionInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && quickQuestionInput.trim()) {
                              handleAskQuestion(quickQuestionInput.trim());
                              setQuickQuestionInput('');
                              setActiveView('REHEARSAL');
                            }
                          }}
                          className="flex-1 bg-cream-100 border border-cream-300 rounded-xl px-3 py-2 text-xs text-ink-950 placeholder-ink-400 focus:outline-none focus:border-orange-brand shadow-inner"
                        />
                        <button
                          onClick={() => {
                            if (quickQuestionInput.trim()) {
                              handleAskQuestion(quickQuestionInput.trim());
                              setQuickQuestionInput('');
                              setActiveView('REHEARSAL');
                            }
                          }}
                          className="bg-orange-brand hover:bg-orange-bright text-cream-50 px-3.5 py-2 rounded-xl text-xs font-bold shadow-warm-sm"
                        >
                          Ask
                        </button>
                      </div>

                      {/* Quick query chips */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button
                          onClick={() => { handleAskQuestion("Why did we decide to use PostgreSQL instead of MongoDB?"); setActiveView('REHEARSAL'); }}
                          className="bg-cream-100 hover:bg-cream-200 border border-cream-300 text-[11px] text-ink-700 px-2.5 py-1 rounded-lg transition-colors shadow-warm-sm"
                        >
                          Why PostgreSQL?
                        </button>
                        <button
                          onClick={() => { handleAskQuestion("Why is the payment retry limit set to 3?"); setActiveView('REHEARSAL'); }}
                          className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-[11px] text-rose-900 px-2.5 py-1 rounded-lg transition-colors shadow-warm-sm font-medium"
                        >
                          Why Retry Limit = 3? (Gap)
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Card D: Recent Knowledge Activity & Ingestion Feed */}
                  <div className="bg-cream-50 border border-cream-300 rounded-2xl p-6 shadow-warm space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-ink-700" />
                        <h4 className="font-bold text-sm text-ink-950 font-serif">
                          Knowledge Intelligence Audit Log
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono text-ink-600">4 Events</span>
                    </div>

                    <div className="space-y-3 font-mono text-xs">
                      <div className="p-3 bg-cream-100 border border-cream-300 rounded-xl space-y-1 shadow-warm-sm">
                        <div className="flex items-center justify-between text-[10px] text-ink-500">
                          <span className="text-emerald-700 font-bold font-mono">VERIFIED EVIDENCE RECORD</span>
                          <span>1 hr ago</span>
                        </div>
                        <p className="text-ink-900 font-sans text-xs">
                          PostgreSQL decision verified with <code className="text-orange-brand">src-doc-arch-01</code>
                        </p>
                      </div>

                      <div className="p-3 bg-cream-100 border border-cream-300 rounded-xl space-y-1 shadow-warm-sm">
                        <div className="flex items-center justify-between text-[10px] text-ink-500">
                          <span className="text-amber-700 font-bold font-mono">KNOWLEDGE GAP DETECTED</span>
                          <span>3 hrs ago</span>
                        </div>
                        <p className="text-ink-900 font-sans text-xs">
                          Commit 88f2a1 ingested with missing decision rationale
                        </p>
                      </div>

                      <div className="p-3 bg-cream-100 border border-cream-300 rounded-xl space-y-1 shadow-warm-sm">
                        <div className="flex items-center justify-between text-[10px] text-ink-500">
                          <span className="text-orange-brand font-bold font-mono">STRESS TEST EXECUTED</span>
                          <span>5 hrs ago</span>
                        </div>
                        <p className="text-ink-900 font-sans text-xs">
                          BFS engine computed 2 direct SPOFs and 1 downstream ripple
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeView === 'STRESS_TEST' && (
            <ContinuityStressTestView
              report={stressReport}
              onInitiateRehearsalForComponent={(compName) => {
                setActiveView('REHEARSAL');
              }}
            />
          )}

          {activeView === 'REHEARSAL' && (
            <HandoverRehearsalChat
              projectId={PROJECT_ID}
              currentRole={currentRole}
              currentUserId={USER_IDS[currentRole]}
              exchanges={exchanges}
              onAskQuestion={handleAskQuestion}
              onReplyQuestion={handleReplyQuestion}
              onReviewQuestion={handleReviewQuestion}
            />
          )}

          {activeView === 'DEPARTING_QUEUE' && (
            <DepartingMemberWorkspace
              departingName="Departing Member"
              pendingQuestions={exchanges.map(e => ({
                id: e.id,
                question: e.question,
                status: e.status,
                departing_reply: e.departing_reply
              }))}
              missingReasons={[
                {
                  id: "dec-retry",
                  title: "Set Payment Retry Limit to 3",
                  component_name: "Payment Retry Worker"
                }
              ]}
              onSubmitReply={async (id, text) => {
                await handleReplyQuestion(id, text);
              }}
            />
          )}

          {activeView === 'KNOWLEDGE' && (
            <KnowledgeModelExplorer
              decisions={[
                {
                  id: "dec-1",
                  title: "Use PostgreSQL for Financial Ledger",
                  reason: "Relational transactions and strict ACID compliance needed for ledger auditing",
                  status: "evidence_supported",
                  source_id: "src-doc-arch-01",
                  evidence_quote: "because relational transactions and strict ACID compliance are non-negotiable for financial auditing"
                },
                {
                  id: "dec-2",
                  title: "Set Payment Retry Limit to 3",
                  reason: null,
                  status: "reason_missing",
                  source_id: "src-git-commit-42",
                  evidence_quote: "Decided to set payment retry limit to 3"
                }
              ]}
              components={[
                { id: "c-1", name: "Authentication Service", owner_name: "Departing Member", status: "ACTIVE", source_id: "src-doc-arch-01" },
                { id: "c-2", name: "Payment Retry Worker", owner_name: "Departing Member", status: "ACTIVE", source_id: "src-git-commit-42" },
                { id: "c-3", name: "Analytics Dashboard", owner_name: "Frontend Lead", status: "ACTIVE", source_id: "src-doc-arch-01" }
              ]}
              dependencies={[
                { id: "dep-1", source_name: "Payment Retry Worker", target_name: "Authentication Service", type: "CALLS_API", is_hidden: false, source_id: "src-doc-arch-01" },
                { id: "dep-2", source_name: "Analytics Dashboard", target_name: "Authentication Service", type: "CALLS_API", is_hidden: true, source_id: "src-git-commit-42" }
              ]}
              failures={[
                { id: "f-1", title: "Stripe Webhook Concurrency Conflict", error: "HTTP 409 Conflict: Concurrent charge updates caused double capture.", fix: "Added redis distributed lock on charge.id key before processing webhook event.", source_id: "src-git-commit-42" }
              ]}
            />
          )}

          {activeView === 'READINESS' && (
            <SuccessorReadinessView
              scenarios={scenarios.length > 0 ? scenarios : [
                {
                  scenario_id: "scen-pay-retry",
                  component_name: "Payment Retry Worker",
                  scenario_prompt: "Incident Simulation: Stripe webhook throws 409 charge conflict on simultaneous retries.",
                  expected_action_checklist: [
                    "Consult verified decision rationale in approved rehearsal evidence",
                    "Verify exponential backoff config (limit 3 attempts)",
                    "Confirm lock TTL parameter set to 5000ms"
                  ],
                  critical_evidence_cited: ["src-git-commit-42"]
                },
                {
                  scenario_id: "scen-auth-dash",
                  component_name: "Analytics Dashboard",
                  scenario_prompt: "API Contract Check: Confirm private session endpoint format between Dashboard and Auth Service.",
                  expected_action_checklist: [
                    "Verify hidden dependency flags in Cairn dependency graph",
                    "Review contract parameters with Frontend Lead",
                    "Ensure JWT expiration tokens refresh without service restarts"
                  ],
                  critical_evidence_cited: ["src-doc-arch-01"]
                }
              ]}
              handoverPacket={handoverPacket || {
                project_id: PROJECT_ID,
                project_name: "FinTrack Core Banking Ledger",
                generated_at: new Date().toISOString(),
                departing_member: "Departing Member",
                successor_member: "Successor Member",
                continuity_score: scoreData.overall_score,
                components: [
                  { name: "Authentication Service", owner: "Departing Member (Transferring)", source_id: "src-doc-arch-01", status: "ACTIVE" },
                  { name: "Payment Retry Worker", owner: "Departing Member (Transferring)", source_id: "src-git-commit-42", status: "ACTIVE" },
                  { name: "Analytics Dashboard", owner: "Frontend Lead", source_id: "src-doc-arch-01", status: "ACTIVE" }
                ],
                verified_decisions: [
                  { title: "Use PostgreSQL for Financial Ledger", reason: "Relational transactions and strict ACID compliance needed for ledger auditing", source_id: "src-doc-arch-01", evidence_quote: "Meeting notes: ACID requirements non-negotiable." }
                ],
                resolved_failure_playbooks: [
                  { title: "Stripe Webhook Concurrency Race Condition", error: "HTTP 409 Conflict: Concurrent charge updates caused double capture.", fix: "Added redis distributed lock on charge.id key before processing webhook event.", resolution: "Resolved: Lock TTL set to 5000ms with retry backoff.", source_id: "src-git-commit-42" }
                ],
                open_attention_items: [
                  { title: "Hidden Dependency: Analytics Dashboard -> Auth API", type: "HIDDEN_DEPENDENCY", description: "Dashboard calls private internal Auth session endpoint." }
                ]
              }}
            />
          )}
        </div>
      </main>

      {/* ========================================================= */}
      {/* 3. INGESTION MODAL                                        */}
      {/* ========================================================= */}
      <IngestionModal
        projectId={PROJECT_ID}
        isOpen={isIngestOpen}
        onClose={() => setIsIngestOpen(false)}
        onIngestSuccess={() => {
          loadLiveData();
          setIsIngestOpen(false);
          setActiveView('KNOWLEDGE');
        }}
      />
    </div>
  );
};

export default CairnWorkspace;
