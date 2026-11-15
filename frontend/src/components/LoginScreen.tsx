import React, { useState } from 'react';
import { CairnLogo } from './CairnLogo';
import { AuthenticatedSession, loginWithCredentials } from '../api/client';
import { UserRole } from './HandoverRehearsalChat';
import {
  ShieldCheck,
  UserMinus,
  GraduationCap,
  Eye,
  EyeOff,
  Lock,
  User as UserIcon,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  KeyRound
} from 'lucide-react';

interface RoleAccountPreset {
  role: UserRole;
  title: string;
  badge: string;
  clearance: string;
  summary: string;
  username: string;
  email: string;
  password: string;
  userId: string;
  fullName: string;
}

export const ROLE_PRESETS: RoleAccountPreset[] = [
  {
    role: 'INCOMING_MEMBER',
    title: 'Successor Member',
    badge: 'Incoming Engineer',
    clearance: 'RESTRICTED_TEAM',
    summary: 'Query verified Knowledge Model evidence, rehearse handover Q&A, and complete readiness drills.',
    username: 'successor',
    email: 'successor.member@cairn.local',
    password: 'cairn-successor',
    userId: 'usr-dev-b',
    fullName: 'Successor Member'
  },
  {
    role: 'DEPARTING_MEMBER',
    title: 'Departing Member',
    badge: 'Knowledge Owner',
    clearance: 'RESTRICTED_TEAM',
    summary: 'Answer escalated handover queue questions and supply primary evidence rationale.',
    username: 'departing',
    email: 'departing.member@cairn.local',
    password: 'cairn-departing',
    userId: 'usr-dev-a',
    fullName: 'Departing Member'
  },
  {
    role: 'MANAGER',
    title: 'Engineering Manager',
    badge: 'Governance & Approval',
    clearance: 'RESTRICTED_MANAGER',
    summary: 'Inspect confidential retention docs, run absence stress tests, and promote answers into the Knowledge Model.',
    username: 'manager',
    email: 'manager@cairn.local',
    password: 'cairn-manager',
    userId: 'usr-mgr-01',
    fullName: 'Engineering Manager'
  }
];

interface LoginScreenProps {
  onLoginSuccess: (session: AuthenticatedSession, isOfflineFallback: boolean) => void;
  initialRole?: UserRole;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  initialRole = 'INCOMING_MEMBER'
}) => {
  const defaultPreset = ROLE_PRESETS.find((r) => r.role === initialRole) || ROLE_PRESETS[0];

  const [selectedRole, setSelectedRole] = useState<UserRole>(defaultPreset.role);
  const [username, setUsername] = useState<string>(defaultPreset.username);
  const [password, setPassword] = useState<string>(defaultPreset.password);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSelectRole = (preset: RoleAccountPreset) => {
    setSelectedRole(preset.role);
    setUsername(preset.username);
    setPassword(preset.password);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedUser = username.trim();
    if (!trimmedUser || !password) {
      setErrorMessage('Please enter both username and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await loginWithCredentials(trimmedUser, password, {
        role: selectedRole
      });
      onLoginSuccess(session, false);
    } catch (err: any) {
      const statusCode = err?.status;
      if (statusCode === 401 || statusCode === 403 || statusCode === 400) {
        setErrorMessage(err.message || 'Invalid username, password, or selected role.');
      } else {
        // Backend unreachable: validate against local demo presets if offline
        const norm = trimmedUser.toLowerCase();
        const match = ROLE_PRESETS.find(
          (p) =>
            (p.username === norm || p.email === norm || p.userId === norm) &&
            p.password === password
        );
        if (!match) {
          setErrorMessage('Unable to reach server, and local credentials do not match any demo role.');
        } else if (match.role !== selectedRole) {
          setErrorMessage(`Role mismatch: account '${trimmedUser}' belongs to ${match.title}.`);
        } else {
          onLoginSuccess(
            {
              access_token: 'local-offline-session',
              user_id: match.userId,
              role: match.role,
              full_name: match.fullName,
              username: match.username,
              email: match.email
            },
            true
          );
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderRoleIcon = (role: UserRole) => {
    if (role === 'MANAGER') return <ShieldCheck className="w-4 h-4 text-purple-300" />;
    if (role === 'DEPARTING_MEMBER') return <UserMinus className="w-4 h-4 text-amber-300" />;
    return <GraduationCap className="w-4 h-4 text-orange-bright" />;
  };

  const activePreset = ROLE_PRESETS.find((r) => r.role === selectedRole) || ROLE_PRESETS[0];

  return (
    <div className="min-h-screen w-full bg-cream-200 text-ink-900 flex items-center justify-center p-4 sm:p-8 font-sans">
      <div className="w-full max-w-5xl bg-cream-50 border border-cream-300 rounded-3xl shadow-warm-lg overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Left Obsidian Panel: Brand & Role Selector with Visible Credentials */}
        <div className="lg:col-span-6 bg-ink-900 text-cream-100 p-7 sm:p-9 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-ink-850">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <CairnLogo size="lg" showText={true} inverted={true} />
              <span className="text-[10px] font-mono uppercase tracking-widest px-2.5 py-1 rounded-full bg-ink-850 border border-ink-700 text-cream-300">
                RBAC Portal
              </span>
            </div>

            <div>
              <h1 className="text-2xl font-serif font-bold text-cream-50 tracking-tight">
                Sign in by Project Role
              </h1>
              <p className="text-xs text-cream-400 mt-1.5 leading-relaxed">
                Select a handover role below to fill its workspace credentials, or sign in manually using the username and password form.
              </p>
            </div>

            <div className="space-y-3" role="radiogroup" aria-label="Project handover roles">
              {ROLE_PRESETS.map((preset) => {
                const isSelected = selectedRole === preset.role;
                return (
                  <button
                    key={preset.role}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => handleSelectRole(preset)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all ${
                      isSelected
                        ? 'bg-ink-850 border-orange-brand shadow-md shadow-orange-brand/10'
                        : 'bg-ink-950/70 border-ink-800 hover:border-ink-600 hover:bg-ink-850/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-ink-900 border border-ink-700 flex items-center justify-center flex-shrink-0">
                          {renderRoleIcon(preset.role)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-cream-50">{preset.title}</span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-ink-900 border border-ink-700 text-cream-300">
                              {preset.clearance}
                            </span>
                          </div>
                          <p className="text-[11px] text-cream-400 mt-0.5">{preset.summary}</p>
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-orange-bright flex-shrink-0" />}
                    </div>

                    {/* Explicit Username & Password Visible on the Login Screen */}
                    <div className="mt-3 pt-2.5 border-t border-ink-800/80 grid grid-cols-2 gap-2 text-[11px] font-mono">
                      <div className="bg-ink-950/90 border border-ink-800 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-1">
                        <span className="text-cream-400">Username:</span>
                        <code className="text-orange-bright font-bold">{preset.username}</code>
                      </div>
                      <div className="bg-ink-950/90 border border-ink-800 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-1">
                        <span className="text-cream-400">Password:</span>
                        <code className="text-cream-100 font-bold">{preset.password}</code>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-ink-850 flex items-center justify-between text-[11px] font-mono text-cream-400">
            <span className="flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-orange-bright" />
              HMAC-SHA256 Signed Bearer Session
            </span>
            <span>v1.0.0</span>
          </div>
        </div>

        {/* Right Parchment Panel: Credential Sign-In Form */}
        <div className="lg:col-span-6 p-7 sm:p-10 flex flex-col justify-center bg-cream-50">
          <div className="max-w-md w-full mx-auto space-y-6">
            <div>
              <div className="inline-flex items-center gap-2 text-[11px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-orange-light text-orange-brand border border-orange-brand/25 mb-3">
                <span>Selected Role: {activePreset.title}</span>
              </div>
              <h2 className="text-2xl font-serif font-bold text-ink-950">
                Workspace Sign In
              </h2>
              <p className="text-xs text-ink-600 mt-1">
                Authenticate with your assigned username and password to enter the Cairn Continuity Control Tower.
              </p>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="cairn-role-select"
                  className="block text-xs font-semibold text-ink-800 mb-1.5"
                >
                  Role
                </label>
                <select
                  id="cairn-role-select"
                  name="role"
                  value={selectedRole}
                  onChange={(e) => {
                    const matched = ROLE_PRESETS.find((r) => r.role === e.target.value);
                    if (matched) handleSelectRole(matched);
                  }}
                  className="w-full rounded-xl border border-cream-300 bg-cream-100 px-3.5 py-2.5 text-sm font-medium text-ink-900 focus:outline-none focus:ring-2 focus:ring-orange-brand/30 focus:border-orange-brand"
                >
                  {ROLE_PRESETS.map((preset) => (
                    <option key={preset.role} value={preset.role}>
                      {preset.title} ({preset.badge} — {preset.clearance})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="cairn-username"
                  className="block text-xs font-semibold text-ink-800 mb-1.5"
                >
                  Username or Email
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-ink-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="cairn-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="none"
                    enterKeyHint="next"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. successor, departing, or manager"
                    className="w-full rounded-xl border border-cream-300 bg-white pl-10 pr-3.5 py-2.5 text-sm text-ink-950 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-brand/30 focus:border-orange-brand"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="cairn-password"
                  className="block text-xs font-semibold text-ink-800 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-ink-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="cairn-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    enterKeyHint="done"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter role password"
                    className="w-full rounded-xl border border-cream-300 bg-white pl-10 pr-11 py-2.5 text-sm text-ink-950 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-brand/30 focus:border-orange-brand"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-ink-500 hover:text-ink-900 hover:bg-cream-100 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-orange-brand hover:bg-orange-bright disabled:opacity-60 text-cream-50 font-bold text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md shadow-orange-brand/25 transition-all"
              >
                <span>{isSubmitting ? 'Signing In...' : 'Sign In'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Quick Credential Summary */}
            <div className="rounded-2xl bg-cream-100 border border-cream-300 p-4 space-y-2">
              <div className="text-[11px] font-mono font-bold text-ink-700 uppercase tracking-wider">
                Active Role Credentials
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <span className="text-ink-500 block text-[10px]">USERNAME</span>
                  <span className="font-bold text-ink-900">{activePreset.username}</span>
                </div>
                <div>
                  <span className="text-ink-500 block text-[10px]">PASSWORD</span>
                  <span className="font-bold text-ink-900">{activePreset.password}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
