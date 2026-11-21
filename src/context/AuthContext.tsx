import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, getSupabaseConfigError } from '../lib/supabase';
import {
  OPTIONAL_PROFILE_COLUMNS,
  PROFILE_COLUMN_ALIASES,
  isMissingSchemaTableError,
  runSingleWriteWithColumnFallback,
} from '../lib/schemaFallback';
import type { UserProfile } from '../types/domain';
import { useI18n } from '../i18n/I18nContext';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  adminRole: string | null;
  loading: boolean;
  isConfigured: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (
    email: string,
    password: string,
    displayName?: string
  ) => Promise<void>;
  updateProfile: (updates: {
    display_name?: string;
    avatar_url?: string | null;
    preferred_language?: 'en' | 'hi';
  }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function buildProfileFromAuthUser(authUser: User): UserProfile {
  const meta = (authUser.user_metadata || {}) as Record<string, unknown>;
  const rawName =
    typeof meta.display_name === 'string'
      ? meta.display_name
      : typeof meta.full_name === 'string'
        ? meta.full_name
        : null;
  const rawAvatar = typeof meta.avatar_url === 'string' ? meta.avatar_url : null;
  const rawLang = meta.preferred_language === 'hi' ? 'hi' : 'en';

  return {
    id: authUser.id,
    display_name: rawName?.trim() || null,
    avatar_url: rawAvatar?.trim() || null,
    preferred_language: rawLang,
    is_suspended: false,
    created_at: authUser.created_at || new Date().toISOString(),
    updated_at: authUser.updated_at || authUser.created_at || new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setLanguage } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);

  const loadUserDetails = useCallback(
    async (authUser: User | null) => {
      if (!supabase || !authUser) {
        setProfile(null);
        setAdminRole(null);
        return;
      }

      const [profileRes, adminRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle(),
        supabase.from('admin_roles').select('role').eq('user_id', authUser.id).maybeSingle(),
      ]);

      const fallbackProfile = buildProfileFromAuthUser(authUser);
      if (profileRes.data && !profileRes.error) {
        const p = profileRes.data as UserProfile;
        setProfile(p);
        if (p.preferred_language === 'hi' || p.preferred_language === 'en') {
          setLanguage(p.preferred_language);
        }
      } else {
        setProfile(fallbackProfile);
        if (
          fallbackProfile.preferred_language === 'hi' ||
          fallbackProfile.preferred_language === 'en'
        ) {
          setLanguage(fallbackProfile.preferred_language);
        }
      }

      setAdminRole(adminRes.data?.role && !adminRes.error ? String(adminRes.data.role) : null);
    },
    [setLanguage]
  );

  useEffect(() => {
    if (!supabase || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session ?? null);
        setUser(data.session?.user ?? null);
        return loadUserDetails(data.session?.user ?? null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
      void loadUserDetails(nextSession?.user ?? null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadUserDetails]);

  const signInWithPassword = async (email: string, password: string) => {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error(getSupabaseConfigError());
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw new Error(error.message);
  };

  const signUpWithPassword = async (
    email: string,
    password: string,
    displayName?: string
  ): Promise<void> => {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error(getSupabaseConfigError());
    }
    const normalizedEmail = email.trim();
    const trimmedName = displayName?.trim() || undefined;

    // Prefer server-side direct user creation (bypasses email confirmation) when configured
    const regRes = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: normalizedEmail,
        password,
        displayName: trimmedName,
      }),
    }).catch(() => null);

    if (regRes && regRes.ok) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (signInErr) throw new Error(signInErr.message);
      return;
    }

    if (regRes && regRes.status !== 503) {
      const body = await regRes.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error || 'Unable to create account.');
    }

    // Direct client signup when server service role is not configured
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: trimmedName ? { display_name: trimmedName } : undefined,
      },
    });
    if (error) throw new Error(error.message);

    if (!data.session) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (signInErr) {
        throw new Error(
          'Account created, but Supabase still has "Confirm email" enabled. Disable "Confirm email" in Supabase Authentication settings or configure SUPABASE_SERVICE_ROLE_KEY on the server.'
        );
      }
    }
  };

  const updateProfile = async (updates: {
    display_name?: string;
    avatar_url?: string | null;
    preferred_language?: 'en' | 'hi';
  }) => {
    if (!supabase || !user) throw new Error('You must be signed in to update your profile.');

    const client = supabase;
    const nextDisplayName = updates.display_name?.trim() || null;
    const nextAvatarUrl = updates.avatar_url?.trim() || null;
    const nextPreferredLanguage: 'en' | 'hi' =
      updates.preferred_language ?? profile?.preferred_language ?? 'en';

    const profilePayload: Record<string, unknown> = {
      id: user.id,
      display_name: nextDisplayName,
      avatar_url: nextAvatarUrl,
      preferred_language: nextPreferredLanguage,
    };

    const { data, error } = await runSingleWriteWithColumnFallback<unknown>(
      profilePayload,
      OPTIONAL_PROFILE_COLUMNS,
      (row) => client.from('profiles').upsert(row).select('*').single(),
      PROFILE_COLUMN_ALIASES
    );

    if (!error && data) {
      // Keep Supabase Auth user_metadata in sync as well (best-effort)
      void client.auth.updateUser({
        data: {
          display_name: nextDisplayName,
          avatar_url: nextAvatarUrl,
          preferred_language: nextPreferredLanguage,
        },
      });
      const updated = data as UserProfile;
      setProfile(updated);
      if (updated.preferred_language === 'hi' || updated.preferred_language === 'en') {
        setLanguage(updated.preferred_language);
      }
      return;
    }

    // If `public.profiles` is not yet created/exposed in PostgREST schema cache,
    // persist real profile preferences directly in Supabase Auth user_metadata.
    if (isMissingSchemaTableError(error?.message, 'profiles')) {
      const { data: authUpdated, error: authErr } = await client.auth.updateUser({
        data: {
          display_name: nextDisplayName,
          avatar_url: nextAvatarUrl,
          preferred_language: nextPreferredLanguage,
        },
      });
      if (authErr) throw new Error(authErr.message);

      const updatedUser = authUpdated.user ?? user;
      setUser(updatedUser);
      const updatedProfile: UserProfile = {
        ...buildProfileFromAuthUser(updatedUser),
        display_name: nextDisplayName,
        avatar_url: nextAvatarUrl,
        preferred_language: nextPreferredLanguage,
        updated_at: new Date().toISOString(),
      };
      setProfile(updatedProfile);
      setLanguage(nextPreferredLanguage);
      return;
    }

    throw new Error(error?.message || 'Unable to save profile.');
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setAdminRole(null);
  };

  const refreshProfile = async () => {
    await loadUserDetails(user);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        isAdmin: Boolean(adminRole),
        adminRole,
        loading,
        isConfigured: isSupabaseConfigured,
        signInWithPassword,
        signUpWithPassword,
        updateProfile,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
