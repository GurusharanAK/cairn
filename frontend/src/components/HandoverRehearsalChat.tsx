import React, { useState } from 'react';
import { 
  Send, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ShieldCheck, 
  UserCheck, 
  UserMinus,
  FileCheck, 
  MessageSquare, 
  XCircle,
  RotateCcw,
  HelpCircle,
  Sparkles,
  Link,
  Lock,
  ArrowRight
} from 'lucide-react';

export type UserRole = 'MANAGER' | 'DEPARTING_MEMBER' | 'INCOMING_MEMBER';

export interface RehearsalExchange {
  id: string;
  project_id: string;
  requester_name: string;
  question: string;
  status: 'ANSWERED_FROM_EVIDENCE' | 'PENDING_DEPARTING_REPLY' | 'pending_review' | 'APPROVED_AS_EVIDENCE' | 'REJECTED';
  evidence_answer?: string | null;
  cited_source_ids?: string[] | null;
  departing_reply?: string | null;
  manager_review_comment?: string | null;
  approved_source_document_id?: string | null;
  created_at: string;
}

interface HandoverRehearsalChatProps {
  projectId: string;
  currentRole: UserRole;
  currentUserId: string;
  exchanges: RehearsalExchange[];
  onAskQuestion: (question: string) => Promise<void>;
  onReplyQuestion: (questionId: string, replyText: string) => Promise<void>;
  onReviewQuestion: (questionId: string, approved: boolean, comment?: string) => Promise<void>;
  onSwitchRole?: (role: UserRole) => void;
  onResetDemo?: () => Promise<void>;
}

export const HandoverRehearsalChat: React.FC<HandoverRehearsalChatProps> = ({
  projectId,
  currentRole,
  currentUserId,
  exchanges,
  onAskQuestion,
  onReplyQuestion,
  onReviewQuestion,
  onSwitchRole,
  onResetDemo
}) => {
  const [newQuestion, setNewQuestion] = useState('');
  const [resettingDemo, setResettingDemo] = useState(false);
  const [submittingQuestion, setSubmittingQuestion] = useState(false);
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [managerNotes, setManagerNotes] = useState<Record<string, string>>({});

  const SUGGESTED_QUESTIONS = [
    "Why is the payment retry limit set to 3?",
    "Why did we decide to use PostgreSQL instead of MongoDB?",
    "How does Analytics Dashboard authenticate with the Auth API?"
  ];

  const handleAskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim()) return;
    setSubmittingQuestion(true);
    try {
      await onAskQuestion(newQuestion.trim());
      setNewQuestion('');
    } finally {
      setSubmittingQuestion(false);
    }
  };

  const handleQuickQuestion = async (q: string) => {
    setSubmittingQuestion(true);
    try {
      await onAskQuestion(q);
    } finally {
      setSubmittingQuestion(false);
    }
  };

  const handleReplySubmit = async (questionId: string) => {
    const text = replyInputs[questionId];
    if (!text || !text.trim()) return;
    await onReplyQuestion(questionId, text.trim());
    setReplyInputs(prev => ({ ...prev, [questionId]: '' }));
  };

  const handleReviewSubmit = async (questionId: string, approved: boolean) => {
    const comment = managerNotes[questionId];
    await onReviewQuestion(questionId, approved, comment);
    setManagerNotes(prev => ({ ...prev, [questionId]: '' }));
  };

  return (
    <div className="bg-cream-50 border border-cream-300 rounded-2xl flex flex-col h-[750px] shadow-warm overflow-hidden text-ink-900">
      {/* Top Banner: Zero-Hallucination Mandate Guarantee */}
      <div className="p-4 px-6 border-b border-cream-300 bg-cream-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-orange-light border border-orange-brand/30 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-orange-brand" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink-950 font-serif flex items-center gap-2">
              Handover Rehearsal Dialogue
              <span className="text-[10px] font-mono font-bold bg-orange-light text-orange-brand border border-orange-brand/30 px-2 py-0.5 rounded-full">
                Zero-Hallucination Mandate
              </span>
            </h3>
            <p className="text-[11px] text-ink-600">
              Cairn refuses to guess answers. If unrecorded in authorized project docs, questions route to the departing member.
            </p>
          </div>
        </div>

        {/* Current Active Persona Indicator & Demo Controls */}
        <div className="flex items-center gap-3">
          {onResetDemo && (
            <button
              onClick={async () => {
                setResettingDemo(true);
                try {
                  await onResetDemo();
                } finally {
                  setResettingDemo(false);
                }
              }}
              disabled={resettingDemo}
              className="bg-cream-200 hover:bg-cream-300 border border-cream-400 text-ink-800 text-[11px] font-mono font-bold px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              title="Reset project back to pristine initial state with open gaps ready to test"
            >
              <RotateCcw className={`w-3.5 h-3.5 text-orange-brand ${resettingDemo ? 'animate-spin' : ''}`} />
              <span>{resettingDemo ? 'Resetting...' : 'Reset Demo Flow'}</span>
            </button>
          )}

          <div className="text-right font-mono text-xs border-l border-cream-300 pl-3">
            <span className="text-[10px] text-ink-600 uppercase block">ACTING AS:</span>
            <span className="font-bold text-orange-brand">{currentRole}</span>
          </div>
        </div>
      </div>

      {/* Suggested Quick Questions */}
      <div className="px-6 py-2.5 bg-cream-200/60 border-b border-cream-300 flex items-center gap-2 overflow-x-auto text-xs">
        <span className="text-[11px] font-mono text-ink-600 flex-shrink-0">Demo Queries:</span>
        {SUGGESTED_QUESTIONS.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleQuickQuestion(q)}
            disabled={submittingQuestion}
            className="bg-cream-50 hover:bg-cream-100 text-ink-800 text-[11px] px-3 py-1 rounded-lg border border-cream-300 hover:border-orange-brand whitespace-nowrap transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <span>{q}</span>
            <ArrowRight className="w-3 h-3 text-orange-brand" />
          </button>
        ))}
      </div>

      {/* Rehearsal Conversation Stream */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {exchanges.map((ex) => (
          <div key={ex.id} className="space-y-3">
            {/* 1. Successor Question Bubble */}
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-cream-200 border border-cream-300 flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-ink-700">
                Q
              </div>
              <div className="bg-cream-100 border border-cream-300 rounded-2xl p-4 max-w-2xl shadow-xs">
                <div className="flex items-center justify-between text-[11px] font-mono text-ink-600 mb-1">
                  <span>{ex.requester_name}</span>
                  <span>{new Date(ex.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="text-sm font-semibold text-ink-950 font-sans">{ex.question}</p>
              </div>
            </div>

            {/* 2. Response Status Flow */}
            <div className="pl-10">
              {/* STATE A: Answered directly from verified text */}
              {ex.status === 'ANSWERED_FROM_EVIDENCE' && (
                <div className="bg-orange-light/50 border border-orange-brand/30 rounded-2xl p-4 max-w-2xl space-y-2 shadow-xs">
                  <div className="flex items-center justify-between text-xs font-mono text-orange-brand font-bold">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-orange-brand" /> VERIFIED EVIDENCE RECORD
                    </span>
                    <span className="text-[10px] bg-cream-50 border border-orange-brand/30 px-2 py-0.5 rounded text-ink-800">
                      Zero Guesses
                    </span>
                  </div>
                  <p className="text-xs text-ink-900 leading-relaxed font-sans">{ex.evidence_answer}</p>
                  {ex.cited_source_ids && ex.cited_source_ids.length > 0 && (
                    <div className="pt-2 border-t border-orange-brand/20 flex items-center gap-2 text-[10px] font-mono text-ink-600">
                      <Link className="w-3 h-3 text-orange-brand" /> CITED SOURCE ID:
                      {ex.cited_source_ids.map(sid => (
                        <span key={sid} className="bg-cream-50 px-1.5 py-0.5 rounded text-orange-brand font-bold border border-orange-brand/20">
                          {sid}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* STATE B: No documentation found - routed to departing member */}
              {ex.status === 'PENDING_DEPARTING_REPLY' && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 max-w-2xl space-y-3 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-mono text-amber-900 font-bold">
                    <AlertCircle className="w-4 h-4 text-amber-700" />
                    UNRECORDED KNOWLEDGE GAP — ROUTED TO DEPARTING MEMBER
                  </div>
                  <p className="text-xs text-ink-700 leading-relaxed">
                    No approved source documents verify this decision. Cairn refused to invent an answer and flagged 
                    this for <strong>Departing Member</strong>.
                  </p>

                  {/* Inline Departing Reply Form */}
                  {currentRole === 'DEPARTING_MEMBER' ? (
                    <div className="pt-2 border-t border-amber-200 space-y-2">
                      <label className="text-[10px] font-mono text-amber-950 uppercase block font-bold">
                        Provide Authoritative Rationale (Departing Member):
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Explain the technical or business reason behind this choice..."
                        value={replyInputs[ex.id] || ''}
                        onChange={(e) => setReplyInputs(prev => ({ ...prev, [ex.id]: e.target.value }))}
                        className="w-full bg-cream-50 border border-amber-300 rounded-xl p-2.5 text-xs text-ink-950 placeholder-ink-400 focus:outline-none focus:border-orange-brand font-sans"
                      />
                      <button
                        onClick={() => handleReplySubmit(ex.id)}
                        className="bg-orange-brand hover:bg-orange-bright text-cream-50 font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
                      >
                        Submit Answer for Manager Review
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl border border-amber-300 bg-amber-100/80">
                      <div className="flex items-center gap-2 text-xs font-mono text-amber-950 font-medium">
                        <Clock className="w-4 h-4 text-amber-700 flex-shrink-0" />
                        <span>Awaiting explanation from Departing Member</span>
                      </div>
                      {onSwitchRole && (
                        <button
                          onClick={() => onSwitchRole('DEPARTING_MEMBER')}
                          className="bg-amber-700 hover:bg-amber-800 text-cream-50 font-mono text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors self-start sm:self-auto shadow-xs"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                          <span>Switch to Departing Member to Answer</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* STATE C: Pending Manager Review */}
              {ex.status === 'pending_review' && (
                <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 max-w-2xl space-y-3 shadow-xs">
                  <div className="flex items-center justify-between text-xs font-mono text-purple-900 font-bold">
                    <span className="flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-purple-700" /> DEPARTING MEMBER ANSWER SUBMITTED
                    </span>
                    <span className="text-[10px] bg-purple-100 border border-purple-300 px-2 py-0.5 rounded text-purple-950">
                      Pending Manager Sign-off
                    </span>
                  </div>

                  <div className="bg-cream-50 p-3 rounded-xl border border-purple-200 text-xs text-ink-900 font-sans">
                    <span className="text-[10px] font-mono text-purple-900 block font-semibold mb-0.5">Departing Member's Submitted Explanation:</span>
                    {ex.departing_reply}
                  </div>

                  {/* Manager Approval Actions */}
                  {currentRole === 'MANAGER' ? (
                    <div className="pt-2 border-t border-purple-200 space-y-2">
                      <input
                        type="text"
                        placeholder="Manager verification sign-off note (optional)..."
                        value={managerNotes[ex.id] || ''}
                        onChange={(e) => setManagerNotes(prev => ({ ...prev, [ex.id]: e.target.value }))}
                        className="w-full bg-cream-50 border border-purple-300 rounded-lg p-2 text-xs text-ink-950 placeholder-ink-400 focus:outline-none focus:border-orange-brand"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleReviewSubmit(ex.id, true)}
                          className="bg-emerald-700 hover:bg-emerald-600 text-cream-50 font-bold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approve into Permanent Evidence
                        </button>
                        <button
                          onClick={() => handleReviewSubmit(ex.id, false)}
                          className="bg-rose-700 hover:bg-rose-600 text-cream-50 font-bold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl border border-purple-300 bg-purple-100/80">
                      <div className="flex items-center gap-2 text-xs font-mono text-purple-950 font-medium">
                        <Lock className="w-4 h-4 text-purple-700 flex-shrink-0" />
                        <span>Awaiting Manager review & sign-off to mint evidence</span>
                      </div>
                      {onSwitchRole && (
                        <button
                          onClick={() => onSwitchRole('MANAGER')}
                          className="bg-purple-700 hover:bg-purple-800 text-cream-50 font-mono text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors self-start sm:self-auto shadow-xs"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Switch to Manager to Review</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* STATE D: Approved and Added to Knowledge Model */}
              {ex.status === 'APPROVED_AS_EVIDENCE' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 max-w-2xl space-y-2.5 shadow-xs">
                  <div className="flex items-center justify-between text-xs font-mono text-emerald-900 font-bold">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" /> APPROVED & ADDED TO KNOWLEDGE MODEL
                    </span>
                    <span className="text-[10px] bg-emerald-200 text-emerald-950 px-2 py-0.5 rounded font-bold border border-emerald-300">
                      Knowledge Model Updated
                    </span>
                  </div>
                  <p className="text-xs text-ink-900 leading-relaxed font-sans">{ex.departing_reply}</p>
                  <div className="pt-2 border-t border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[10px] font-mono text-ink-600">
                    <span>MANAGER SIGN-OFF: {ex.manager_review_comment || 'Approved by Manager'}</span>
                    <span className="text-emerald-800 font-bold">MINTED SOURCE: {ex.approved_source_document_id}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input Bar */}
      <div className="p-4 border-t border-cream-300 bg-cream-100">
        {currentRole === 'DEPARTING_MEMBER' ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-amber-100/80 border border-amber-300 rounded-xl">
            <div className="flex items-center gap-2 text-xs font-mono text-amber-950 font-medium">
              <UserMinus className="w-4 h-4 text-amber-700 flex-shrink-0" />
              <span>Acting as Departing Member. To ask questions, switch to Manager or Successor.</span>
            </div>
            {onSwitchRole && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSwitchRole('INCOMING_MEMBER')}
                  className="bg-orange-brand hover:bg-orange-bright text-cream-50 font-mono text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-xs"
                >
                  Ask as Successor
                </button>
                <button
                  type="button"
                  onClick={() => onSwitchRole('MANAGER')}
                  className="bg-purple-700 hover:bg-purple-800 text-cream-50 font-mono text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-xs"
                >
                  Ask as Manager
                </button>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleAskSubmit} className="flex gap-3">
            <input
              type="text"
              placeholder={
                currentRole === 'MANAGER'
                  ? "Ask question to Departing Member as Engineering Manager (e.g. Why is the payment retry limit set to 3?)..."
                  : "Ask question to Departing Member as Successor (e.g. Why is the payment retry limit set to 3?)..."
              }
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              disabled={submittingQuestion}
              className="flex-1 bg-cream-50 border border-cream-300 rounded-xl px-4 py-2.5 text-xs text-ink-950 placeholder-ink-400 focus:outline-none focus:border-orange-brand transition-colors shadow-xs"
            />
            <button
              type="submit"
              disabled={submittingQuestion || !newQuestion.trim()}
              className="bg-orange-brand hover:bg-orange-bright disabled:opacity-50 text-cream-50 font-bold text-xs px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-sm shadow-orange-brand/30 transition-all whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{currentRole === 'MANAGER' ? 'Ask as Manager' : 'Ask as Successor'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
