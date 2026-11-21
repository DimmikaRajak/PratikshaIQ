import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import {
  adminApproveSuggestion,
  adminModerateReport,
  adminRejectSuggestion,
  adminToggleUserSuspension,
  fetchAdminDashboardData,
} from '../lib/api';
import { formatRelativeTime, getCategoryLabel } from '../lib/utils';
import { SupabaseNotice } from '../components/common/SupabaseNotice';
import { Button, Card, CardContent, CardHeader, Input, Skeleton } from '../components/ui/primitives';

type AdminTab = 'suggestions' | 'flags' | 'suspicious' | 'users' | 'errors';

export function AdminDashboardPage() {
  const { user, isAdmin, loading, isConfigured } = useAuth();
  const { language } = useI18n();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<AdminTab>('suggestions');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const adminQuery = useQuery({
    queryKey: ['admin-dashboard-data'],
    queryFn: fetchAdminDashboardData,
    enabled: Boolean(user && isAdmin && isConfigured),
  });

  if (loading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  if (!isConfigured) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-[#0F2744]">Admin Dashboard</h1>
        <SupabaseNotice />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <Card className="max-w-lg mx-auto">
        <CardContent className="py-10 text-center space-y-3">
          <ShieldAlert className="h-10 w-10 text-red-700 mx-auto" aria-hidden="true" />
          <h1 className="text-xl font-bold text-[#0F2744]">Administrator access required</h1>
          <p className="text-sm text-slate-600">
            This console is restricted to authorized administrators registered in the server-side{' '}
            <code className="font-mono text-xs">admin_roles</code> table. There is no public admin self-registration.
          </p>
        </CardContent>
      </Card>
    );
  }

  const refreshAdmin = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-dashboard-data'] });
  };

  const handleApprove = async (id: string) => {
    setBusyId(id);
    setActionErr(null);
    setActionMsg(null);
    try {
      await adminApproveSuggestion(id, reviewNotes[id]);
      setActionMsg('Office suggestion approved and published to public search.');
      refreshAdmin();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    setBusyId(id);
    setActionErr(null);
    setActionMsg(null);
    try {
      await adminRejectSuggestion(id, reviewNotes[id]);
      setActionMsg('Office suggestion rejected.');
      refreshAdmin();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Rejection failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleModerate = async (
    reportId: string,
    status: 'active' | 'hidden' | 'rejected',
    flagId?: string
  ) => {
    setBusyId(reportId);
    setActionErr(null);
    setActionMsg(null);
    try {
      await adminModerateReport(reportId, status, flagId);
      setActionMsg(`Report updated to "${status}" and office aggregate recalculated.`);
      refreshAdmin();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Moderation failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleSuspend = async (userId: string, suspend: boolean) => {
    setBusyId(userId);
    setActionErr(null);
    setActionMsg(null);
    try {
      await adminToggleUserSuspension(userId, suspend);
      setActionMsg(suspend ? 'User account suspended.' : 'User account restored.');
      refreshAdmin();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Failed to update user status.');
    } finally {
      setBusyId(null);
    }
  };

  const data = adminQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0F2744]">Administrator Console</h1>
        <p className="mt-1 text-sm text-slate-600">
          Review citizen office suggestions, flagged queue reports, suspicious submissions, and system logs.
        </p>
      </div>

      {/* Real Database Counts */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-xs text-slate-500">Approved Offices</p>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0F2744]">
              {data.stats.totalApprovedOffices}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500">Total Queue Reports</p>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0F2744]">
              {data.stats.totalReports}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500">Pending Suggestions</p>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0D7377]">
              {data.stats.pendingSuggestionsCount}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500">Open Report Flags</p>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-amber-700">
              {data.stats.openFlagsCount}
            </p>
          </Card>
        </div>
      )}

      {actionMsg && (
        <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-800">
          {actionMsg}
        </p>
      )}
      {actionErr && (
        <p role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-800">
          {actionErr}
        </p>
      )}

      {/* Segmented Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          [
            { id: 'suggestions', label: 'Office Suggestions' },
            { id: 'flags', label: 'Flagged Reports' },
            { id: 'suspicious', label: 'Suspicious Activity' },
            { id: 'users', label: 'User Moderation' },
            { id: 'errors', label: 'API Error Logs' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`h-9 rounded-lg px-3.5 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              activeTab === tab.id
                ? 'bg-[#0F2744] text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {adminQuery.isLoading ? (
        <Skeleton className="h-56 w-full rounded-xl" />
      ) : !data ? null : activeTab === 'suggestions' ? (
        <Card>
          <CardHeader className="border-b border-slate-100">
            <h2 className="text-base font-semibold text-[#0F2744]">Citizen Office Suggestions</h2>
          </CardHeader>
          <CardContent className="pt-4 divide-y divide-slate-100">
            {data.pendingSuggestions.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">No office suggestions recorded yet.</p>
            ) : (
              data.pendingSuggestions.map((s) => (
                <div key={s.id} className="py-4 first:pt-0 last:pb-0 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[#0F2744]">{s.office_name}</p>
                      <p className="text-xs text-slate-500">
                        {getCategoryLabel(s.category, language)} · {s.address}, {s.city}, {s.state}
                      </p>
                      <p className="text-xs font-mono text-slate-400">
                        {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}
                      </p>
                    </div>
                    <span className="text-xs font-medium capitalize text-slate-600">
                      {s.review_status}
                    </span>
                  </div>

                  {s.review_status === 'pending' && (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        value={reviewNotes[s.id] || ''}
                        onChange={(e) =>
                          setReviewNotes((prev) => ({ ...prev, [s.id]: e.target.value }))
                        }
                        placeholder="Optional reviewer note..."
                        className="h-9 text-xs"
                      />
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="accent"
                          disabled={busyId === s.id}
                          onClick={() => handleApprove(s.id)}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busyId === s.id}
                          onClick={() => handleReject(s.id)}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : activeTab === 'flags' ? (
        <Card>
          <CardHeader className="border-b border-slate-100">
            <h2 className="text-base font-semibold text-[#0F2744]">Flagged Queue Reports</h2>
          </CardHeader>
          <CardContent className="pt-4 divide-y divide-slate-100">
            {data.openFlags.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">No flagged reports.</p>
            ) : (
              data.openFlags.map((flag) => (
                <div key={flag.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>Flag reason: {flag.reason}</span>
                    <span className="capitalize">{flag.status}</span>
                  </div>
                  {flag.queue_report && (
                    <p className="text-xs text-slate-700 font-mono">
                      Crowd: {flag.queue_report.crowd_level} · Wait:{' '}
                      {flag.queue_report.waiting_time_min}–{flag.queue_report.waiting_time_max}m ·
                      Status: {flag.queue_report.report_status}
                    </p>
                  )}
                  {flag.status === 'open' && flag.queue_report && (
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busyId === flag.queue_report.id}
                        onClick={() => handleModerate(flag.queue_report!.id, 'hidden', flag.id)}
                      >
                        Hide Report
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyId === flag.queue_report.id}
                        onClick={() => handleModerate(flag.queue_report!.id, 'active', flag.id)}
                      >
                        Dismiss Flag
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : activeTab === 'suspicious' ? (
        <Card>
          <CardHeader className="border-b border-slate-100">
            <h2 className="text-base font-semibold text-[#0F2744]">
              Suspicious Submissions (Score &ge; 30)
            </h2>
          </CardHeader>
          <CardContent className="pt-4 divide-y divide-slate-100">
            {data.suspiciousReports.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">No suspicious submissions detected.</p>
            ) : (
              data.suspiciousReports.map((rep) => (
                <div key={rep.id} className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#0F2744]">
                      {rep.office?.name || rep.office_id}
                    </p>
                    <p className="text-xs text-slate-600 font-mono">
                      Score: {rep.suspicious_score}/100 · Crowd: {rep.crowd_level} · Wait:{' '}
                      {rep.waiting_time_min}–{rep.waiting_time_max}m ·{' '}
                      {formatRelativeTime(rep.submitted_at, 'en')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busyId === rep.id}
                      onClick={() => handleModerate(rep.id, 'rejected')}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : activeTab === 'users' ? (
        <Card>
          <CardHeader className="border-b border-slate-100">
            <h2 className="text-base font-semibold text-[#0F2744]">Citizen Accounts</h2>
          </CardHeader>
          <CardContent className="pt-4 divide-y divide-slate-100">
            {data.profiles.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">No user profiles found.</p>
            ) : (
              data.profiles.map((p) => (
                <div key={p.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#0F2744] truncate">
                      {p.display_name || p.id}
                    </p>
                    <p className="text-xs text-slate-500 font-mono">
                      Status: {p.is_suspended ? 'Suspended' : 'Active'} · Joined{' '}
                      {new Date(p.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={p.is_suspended ? 'secondary' : 'destructive'}
                    disabled={busyId === p.id || p.id === user.id}
                    onClick={() => handleToggleSuspend(p.id, !p.is_suspended)}
                  >
                    {p.is_suspended ? 'Unsuspend' : 'Suspend'}
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="border-b border-slate-100">
            <h2 className="text-base font-semibold text-[#0F2744]">External API &amp; Data Logs</h2>
          </CardHeader>
          <CardContent className="pt-4 divide-y divide-slate-100">
            {data.apiErrors.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">No API errors logged.</p>
            ) : (
              data.apiErrors.map((log) => (
                <div key={log.id} className="py-3 first:pt-0 last:pb-0 text-xs space-y-0.5">
                  <div className="flex items-center justify-between font-mono text-[#0F2744]">
                    <span>
                      {log.service} · {log.endpoint} {log.status_code ? `(${log.status_code})` : ''}
                    </span>
                    <span className="text-slate-400">
                      {formatRelativeTime(log.created_at, 'en')}
                    </span>
                  </div>
                  <p className="text-slate-600">{log.error_message}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
