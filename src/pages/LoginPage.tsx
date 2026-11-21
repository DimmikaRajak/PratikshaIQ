import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { SupabaseNotice } from '../components/common/SupabaseNotice';
import { Button, Card, CardContent, Input, Label } from '../components/ui/primitives';

type AuthMode = 'signin' | 'signup';

export function LoginPage() {
  const { user, isConfigured, signInWithPassword, signUpWithPassword } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectState = location.state as { from?: string; office?: unknown } | null;

  const [mode, setMode] = useState<AuthMode>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (user) {
    return (
      <Navigate
        to={redirectState?.from || '/dashboard'}
        state={redirectState?.office ? { office: redirectState.office } : undefined}
        replace
      />
    );
  }

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMsg(null);
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 6) {
      setErrorMsg(t.auth.passwordTooShort);
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setErrorMsg(t.auth.passwordMismatch);
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        await signInWithPassword(email, password);
      } else {
        await signUpWithPassword(email, password, displayName);
      }
      navigate(redirectState?.from || '/dashboard', {
        state: redirectState?.office ? { office: redirectState.office } : undefined,
        replace: true,
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : mode === 'signin'
            ? 'Unable to sign in. Please check your email and password.'
            : 'Unable to create account.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6 py-4">
      <div>
        <h1 className="text-2xl font-bold text-[#0F2744]">
          {mode === 'signin' ? t.auth.title : t.auth.signUpTitle}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{t.auth.subtitle}</p>
      </div>

      <SupabaseNotice />

      <Card>
        <CardContent className="pt-5 space-y-5">
          {/* Segmented Mode Switcher: Sign In / Create Account */}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className={`h-9 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'signin'
                  ? 'bg-white text-[#0F2744] shadow-xs'
                  : 'text-slate-600 hover:text-[#0F2744]'
              }`}
            >
              {t.auth.signInTab}
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`h-9 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'signup'
                  ? 'bg-white text-[#0F2744] shadow-xs'
                  : 'text-slate-600 hover:text-[#0F2744]'
              }`}
            >
              {t.auth.signUpTab}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <Label htmlFor="signup-name">{t.auth.displayName}</Label>
                <Input
                  id="signup-name"
                  type="text"
                  maxLength={100}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your full name"
                  disabled={!isConfigured || busy}
                  autoComplete="name"
                />
              </div>
            )}

            <div>
              <Label htmlFor="auth-email">{t.auth.emailLabel}</Label>
              <Input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.auth.emailPlaceholder}
                disabled={!isConfigured || busy}
                autoComplete="email"
              />
            </div>

            <div>
              <Label htmlFor="auth-password">{t.auth.passwordLabel}</Label>
              <div className="relative">
                <Input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.auth.passwordPlaceholder}
                  disabled={!isConfigured || busy}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:text-[#0F2744] cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <div>
                <Label htmlFor="auth-confirm-password">{t.auth.confirmPasswordLabel}</Label>
                <Input
                  id="auth-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t.auth.passwordPlaceholder}
                  disabled={!isConfigured || busy}
                  autoComplete="new-password"
                />
              </div>
            )}

            {errorMsg && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
              >
                {errorMsg}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={!isConfigured || busy}
            >
              {busy
                ? t.common.loading
                : mode === 'signin'
                  ? t.auth.signInButton
                  : t.auth.signUpButton}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
