import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { sanitizeExternalUrl } from '../lib/utils';
import { SupabaseNotice } from '../components/common/SupabaseNotice';
import { Button, Card, CardContent, Input, Label, Select } from '../components/ui/primitives';

export function ProfilePage() {
  const { user, profile, isAdmin, adminRole, isConfigured, updateProfile, signOut } = useAuth();
  const { language, setLanguage, t } = useI18n();

  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [prefLang, setPrefLang] = useState<'en' | 'hi'>(profile?.preferred_language || language);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setAvatarUrl(profile.avatar_url || '');
      setPrefLang(profile.preferred_language || 'en');
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);

    if (avatarUrl.trim() && !sanitizeExternalUrl(avatarUrl)) {
      setErrorMsg('Profile photo URL must start with https:// or http://');
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        display_name: displayName,
        avatar_url: avatarUrl.trim() || null,
        preferred_language: prefLang,
      });
      setStatusMsg(t.auth.profileUpdated);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0F2744]">{t.nav.profile}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage your display preferences and language settings.
        </p>
      </div>

      <SupabaseNotice />

      {!user ? (
        <Card>
          <CardContent className="py-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="guest-lang">{t.auth.preferredLanguage}</Label>
              <Select
                id="guest-lang"
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'en' | 'hi')}
              >
                <option value="en">English</option>
                <option value="hi">हिन्दी (Hindi)</option>
              </Select>
            </div>

            {isConfigured && (
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
                <p className="text-sm text-slate-600">
                  Sign in to track your queue reports and save profile settings.
                </p>
                <Link to="/login">
                  <Button variant="primary">{t.nav.signIn}</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-5 space-y-6">
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="min-w-0">
                <p className="text-base font-semibold text-[#0F2744] truncate">
                  {profile?.display_name || user.email}
                </p>
                <p className="text-xs text-slate-500 font-mono truncate">{user.email}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {t.auth.memberSince}:{' '}
                  <span className="font-mono tabular-nums">
                    {new Date(user.created_at).toLocaleDateString()}
                  </span>
                </p>
              </div>

              {isAdmin && (
                <Link to="/admin">
                  <Button variant="outlineTeal" size="sm">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    <span>Admin ({adminRole})</span>
                  </Button>
                </Link>
              )}
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <Label htmlFor="profile-name">{t.auth.displayName}</Label>
                <Input
                  id="profile-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={100}
                />
              </div>

              <div>
                <Label htmlFor="profile-avatar">Profile photo URL (optional)</Label>
                <Input
                  id="profile-avatar"
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>

              <div>
                <Label htmlFor="profile-lang">{t.auth.preferredLanguage}</Label>
                <Select
                  id="profile-lang"
                  value={prefLang}
                  onChange={(e) => setPrefLang(e.target.value as 'en' | 'hi')}
                >
                  <option value="en">English</option>
                  <option value="hi">हिन्दी (Hindi)</option>
                </Select>
              </div>

              {statusMsg && (
                <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
                  {statusMsg}
                </p>
              )}
              {errorMsg && (
                <p role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
                  {errorMsg}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving ? t.common.loading : t.common.save}
                </Button>

                <Button type="button" variant="secondary" onClick={() => void signOut()}>
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  <span>{t.auth.signOut}</span>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
