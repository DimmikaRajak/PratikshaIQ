import React from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  CalendarClock,
  ClipboardList,
  Compass,
  Home,
  Languages,
  Map as MapIcon,
  PlusCircle,
  ShieldCheck,
  User as UserIcon,
  Building2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { cn } from '../../lib/utils';
import { Button } from '../ui/primitives';

export function AppLayout() {
  const { user, isAdmin } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const location = useLocation();

  const primaryNav = [
    { to: '/dashboard', label: t.nav.home, icon: Home },
    { to: '/explore', label: t.nav.explore, icon: Compass },
    { to: '/map', label: t.nav.map, icon: MapIcon },
    { to: '/my-reports', label: t.nav.myReports, icon: ClipboardList },
    { to: '/profile', label: t.nav.profile, icon: UserIcon },
  ];

  const secondaryNav = [
    { to: '/planner', label: t.nav.planner, icon: CalendarClock },
    { to: '/suggest-office', label: t.nav.suggestOffice, icon: Building2 },
    ...(isAdmin ? [{ to: '/admin', label: t.nav.admin, icon: ShieldCheck }] : []),
  ];

  const toggleLang = () => setLanguage(language === 'en' ? 'hi' : 'en');

  return (
    <div className="min-h-screen bg-[#F7F9FB] text-[#0F2744] flex flex-col lg:flex-row">
      {/* Desktop Sidebar (256px) */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-white z-30">
        <div className="flex h-16 items-center px-6 border-b border-slate-100">
          <Link
            to="/"
            className="text-lg font-bold tracking-tight text-[#0F2744] whitespace-nowrap shrink-0"
          >
            {t.appName}
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6" aria-label="Main navigation">
          <div className="space-y-1">
            {primaryNav.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
                      isActive
                        ? 'bg-[#EEF7F7] text-[#0D7377]'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-[#0F2744]'
                    )
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-1">
            {secondaryNav.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
                      isActive
                        ? 'bg-[#EEF7F7] text-[#0D7377]'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-[#0F2744]'
                    )
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-slate-100 p-4 space-y-2.5">
          <button
            type="button"
            onClick={toggleLang}
            className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <span className="inline-flex items-center gap-2">
              <Languages className="h-4 w-4 text-[#0D7377]" aria-hidden="true" />
              <span>{language === 'en' ? 'English' : 'हिन्दी'}</span>
            </span>
            <span className="text-slate-400">{language === 'en' ? 'हिन्दी' : 'EN'}</span>
          </button>

          {!user && (
            <Link to="/login" className="block">
              <Button variant="secondary" size="sm" className="w-full">
                {t.nav.signIn}
              </Button>
            </Link>
          )}
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0">
        {/* Top Bar (Compact 52px on mobile, 64px on desktop) */}
        <header className="sticky top-0 z-20 flex h-[54px] lg:h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 backdrop-blur-sm px-4 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/"
              className="lg:hidden text-base font-bold tracking-tight text-[#0F2744] whitespace-nowrap shrink-0"
            >
              {t.appName}
            </Link>
            <span className="hidden lg:inline text-sm text-slate-500 truncate">
              {t.tagline}
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={toggleLang}
              aria-label="Switch language"
              className="lg:hidden inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Languages className="h-3.5 w-3.5 text-[#0D7377]" aria-hidden="true" />
              <span>{language === 'en' ? 'हिन्दी' : 'EN'}</span>
            </button>

            <Link to="/report">
              <Button variant="accent" size="sm" className="h-10 lg:h-10 px-3.5">
                <PlusCircle className="h-4 w-4" aria-hidden="true" />
                <span>{t.nav.reportQueue}</span>
              </Button>
            </Link>
          </div>
        </header>

        {/* Secondary quick links bar on mobile for Planner / Suggest / Admin */}
        <div className="lg:hidden flex items-center gap-4 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600">
          <NavLink
            to="/planner"
            className={({ isActive }) =>
              cn('whitespace-nowrap shrink-0 py-1', isActive && 'text-[#0D7377] font-semibold')
            }
          >
            {t.nav.planner}
          </NavLink>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <NavLink
            to="/suggest-office"
            className={({ isActive }) =>
              cn('whitespace-nowrap shrink-0 py-1', isActive && 'text-[#0D7377] font-semibold')
            }
          >
            {t.nav.suggestOffice}
          </NavLink>
          {isAdmin && (
            <>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  cn('whitespace-nowrap shrink-0 py-1', isActive && 'text-[#0D7377] font-semibold')
                }
              >
                {t.nav.admin}
              </NavLink>
            </>
          )}
        </div>

        {/* Page Viewport */}
        <main
          key={location.pathname}
          className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10"
        >
          <Outlet />
        </main>

        {/* Quiet Civic Footer */}
        <footer className="hidden lg:block border-t border-slate-200 bg-white px-8 py-5 text-xs text-slate-500">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <p>{t.common.osmAttribution}</p>
            <p>{t.common.disclaimerEstimate}</p>
          </div>
        </footer>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar (5 destinations, 44px+ touch targets) */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md"
      >
        <div className="grid grid-cols-5 h-[60px]">
          {primaryNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center justify-center gap-0.5 min-h-[44px] text-[10px] font-medium transition-colors',
                    isActive ? 'text-[#0D7377]' : 'text-slate-500 hover:text-[#0F2744]'
                  )
                }
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="truncate max-w-[68px]">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
