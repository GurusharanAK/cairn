import React, { useState } from 'react';
import { 
  UserMinus, 
  HelpCircle, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Send,
  MessageSquare,
  ShieldCheck,
  Check
} from 'lucide-react';

interface DepartingMemberWorkspaceProps {
  departingName: string;
  pendingQuestions: Array<{
    id: string;
    question: string;
    status: string;
    departing_reply?: string | null;
  }>;
  missingReasons: Array<{
    id: string;
    title: string;
    component_name: string;
  }>;
  onSubmitReply: (questionId: string, replyText: string) => Promise<void>;
}

export const DepartingMemberWorkspace: React.FC<DepartingMemberWorkspaceProps> = ({
  departingName,
  pendingQuestions,
  missingReasons,
  onSubmitReply
}) => {
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});

  const handleSendReply = async (id: string) => {
    const text = replies[id];
    if (!text || !text.trim()) return;

    setSubmitting(prev => ({ ...prev, [id]: true }));
    try {
      await onSubmitReply(id, text.trim());
      setReplies(prev => ({ ...prev, [id]: '' }));
    } finally {
      setSubmitting(prev => ({ ...prev, [id]: false }));
    }
  };

  const pendingCount = pendingQuestions.filter(q => q.status === 'PENDING_DEPARTING_REPLY').length;

  return (
    <div className="bg-cream-50 border border-cream-300 rounded-2xl p-6 shadow-warm text-ink-900">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-cream-300 gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-light border border-orange-brand/30 text-orange-brand text-xs font-semibold mb-2">
            <UserMinus className="w-3.5 h-3.5" /> Stage 6: Departing Member Handover Action Center
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-ink-950 font-serif">
            What Walks Out With You, {departingName}
          </h2>
          <p className="text-xs text-ink-700 mt-1 max-w-2xl leading-relaxed">
            Zero-burden handover queue. Successors can only proceed safely if missing reasons and tacit context 
            are recorded before your departure date.
          </p>
        </div>

        {/* Counter Pills */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="bg-cream-100 p-3 px-4 rounded-xl border border-cream-300 shadow-xs">
            <span className="text-[10px] text-ink-600 block font-sans">QUESTIONS AWAITING REPLY</span>
            <span className="text-xl font-bold text-orange-brand">{pendingCount}</span>
          </div>
          <div className="bg-cream-100 p-3 px-4 rounded-xl border border-cream-300 shadow-xs">
            <span className="text-[10px] text-ink-600 block font-sans">UNEXPLAINED CHOICES</span>
            <span className="text-xl font-bold text-ink-900">{missingReasons.length}</span>
          </div>
        </div>
      </div>

      {/* Main Action Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6">
        {/* Left Column: Direct Inquiries */}
        <div className="lg:col-span-8 space-y-4">
          <span className="text-xs font-mono text-ink-600 uppercase tracking-wider block font-semibold">
            Direct Inquiries from Successor:
          </span>

          {pendingQuestions.length === 0 ? (
            <div className="bg-cream-100 border border-cream-300 p-8 rounded-xl text-center text-xs text-ink-600 shadow-xs">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
              All queued successor inquiries have been addressed!
            </div>
          ) : (
            pendingQuestions.map((q) => (
              <div 
                key={q.id}
                className="bg-cream-100 border border-cream-300 p-5 rounded-2xl space-y-3 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-orange-brand flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" /> Successor Question
                  </span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${
                    q.status === 'PENDING_DEPARTING_REPLY' 
                      ? 'bg-amber-100 text-amber-900 border-amber-300' 
                      : 'bg-purple-100 text-purple-900 border-purple-300'
                  }`}>
                    {q.status === 'PENDING_DEPARTING_REPLY' ? 'ACTION REQUIRED' : 'SUBMITTED (WAITING APPROVAL)'}
                  </span>
                </div>

                <h4 className="text-sm font-bold text-ink-950 font-sans">{q.question}</h4>

                {q.status === 'PENDING_DEPARTING_REPLY' ? (
                  <div className="space-y-2 pt-2 border-t border-cream-300">
                    <textarea
                      rows={2}
                      placeholder="Type the authoritative reason/rationale for this choice..."
                      value={replies[q.id] || ''}
                      onChange={(e) => setReplies(prev => ({ ...prev, [q.id]: e.target.value }))}
                      className="w-full bg-cream-50 border border-cream-300 rounded-xl p-3 text-xs text-ink-950 placeholder-ink-400 focus:outline-none focus:border-orange-brand shadow-xs"
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleSendReply(q.id)}
                        disabled={submitting[q.id] || !replies[q.id]?.trim()}
                        className="bg-orange-brand hover:bg-orange-bright disabled:opacity-50 text-cream-50 font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" /> Submit to Manager Review
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-cream-50 p-3 rounded-xl border border-cream-300 text-xs text-ink-700">
                    <span className="text-[10px] font-mono text-ink-500 block mb-0.5">Your Submitted Rationale:</span>
                    {q.departing_reply}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Right Column: Undocumented Choices */}
        <div className="lg:col-span-4 space-y-4">
          <span className="text-xs font-mono text-ink-600 uppercase tracking-wider block font-semibold">
            Undocumented Commits & Choices:
          </span>

          <div className="space-y-3">
            {missingReasons.map((mr) => (
              <div 
                key={mr.id} 
                className="bg-cream-100 border border-cream-300 p-4 rounded-xl space-y-2 shadow-xs"
              >
                <span className="text-[10px] font-mono text-orange-brand uppercase tracking-wider block font-semibold">
                  Component: {mr.component_name}
                </span>
                <h5 className="text-xs font-bold text-ink-950">{mr.title}</h5>
                <p className="text-[11px] text-ink-600">
                  Extracted from git history without explicit explanation in commit text.
                </p>
                <div className="pt-2">
                  <span className="text-[10px] font-mono text-rose-800 bg-rose-100 px-2 py-0.5 rounded border border-rose-200 font-semibold">
                    REASON MISSING
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
