import { Database } from 'lucide-react';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useI18n } from '../../i18n/I18nContext';

export function SupabaseNotice({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  if (isSupabaseConfigured) return null;

  return (
    <div
      role="status"
      className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950"
    >
      <div className="flex items-start gap-3">
        <Database className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="font-semibold text-amber-950">{t.supabaseNotice.title}</p>
          <p className="text-amber-900/90 leading-relaxed">{t.supabaseNotice.description}</p>
          {!compact && (
            <div className="pt-1 font-mono text-xs text-amber-900 space-y-1">
              <p className="font-sans font-medium text-amber-950">
                {t.supabaseNotice.envListLabel}:
              </p>
              <p>VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY</p>
              <p className="font-sans text-amber-800">
                SQL migrations: supabase/migrations/001–003 (PostGIS + RLS + Triggers)
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
