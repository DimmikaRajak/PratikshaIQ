import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Languages } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { LocationPickerBar } from '../components/common/LocationPickerBar';
import { Button } from '../components/ui/primitives';

const HERO_IMAGE_PATH = '/src/assets/images/civic_public_service_hero_1795284838793.jpg';

export function LandingPage() {
  const { language, setLanguage, t } = useI18n();
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);

  return (
    <div className="min-h-screen bg-[#F7F9FB] text-[#0F2744] flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="text-lg font-bold tracking-tight text-[#0F2744] whitespace-nowrap shrink-0"
          >
            {t.appName}
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <Link
              to="/explore"
              className="hover:text-[#0F2744] transition-colors whitespace-nowrap shrink-0"
            >
              {t.nav.explore}
            </Link>
            <Link
              to="/map"
              className="hover:text-[#0F2744] transition-colors whitespace-nowrap shrink-0"
            >
              {t.nav.map}
            </Link>
            <Link
              to="/planner"
              className="hover:text-[#0F2744] transition-colors whitespace-nowrap shrink-0"
            >
              {t.nav.planner}
            </Link>
            <Link
              to="/suggest-office"
              className="hover:text-[#0F2744] transition-colors whitespace-nowrap shrink-0"
            >
              {t.nav.suggestOffice}
            </Link>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <Link to="/dashboard">
              <Button variant="primary" size="sm" className="h-10 px-4">
                <span>{t.nav.home}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Split Section (2-column balanced stretch) */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-10 pb-12 lg:pt-14 lg:pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-medium text-[#0D7377]">{t.landing.eyebrow}</p>
                  <button
                    type="button"
                    onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-[#0F2744] cursor-pointer whitespace-nowrap"
                  >
                    <Languages className="h-3.5 w-3.5 text-[#0D7377]" aria-hidden="true" />
                    <span>{language === 'en' ? 'हिन्दी में देखें' : 'View in English'}</span>
                  </button>
                </div>

                <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-[#0F2744] leading-[1.14]">
                  {t.landing.heroTitle}
                </h1>

                <p className="text-base text-slate-600 leading-relaxed max-w-xl">
                  {t.landing.heroSubtitle}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link to="/explore">
                  <Button variant="accent" size="lg">
                    <span>{t.landing.ctaExplore}</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </Link>
                <Link to="/report">
                  <Button variant="secondary" size="lg">
                    {t.landing.ctaReport}
                  </Button>
                </Link>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-64 sm:h-80 lg:h-full min-h-[280px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-[#0F2744]">
                {!imgError ? (
                  <img
                    src={HERO_IMAGE_PATH}
                    alt="Modern Indian public civic service centre building with sandstone colonnade"
                    referrerPolicy="no-referrer"
                    onError={() => setImgError(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#0F2744] to-[#0D7377] p-6 text-white">
                    <Building2 className="h-12 w-12 opacity-80" aria-hidden="true" />
                    <p className="text-sm font-medium">{t.tagline}</p>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#08172B]/85 via-[#08172B]/40 to-transparent px-5 py-4">
                  <p className="text-xs text-white/95 font-medium">
                    {t.tagline} · 28 States &amp; 8 Union Territories
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Full-width Pan-India Discovery Entry Strip below hero */}
          <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h2 className="text-base font-semibold text-[#0F2744]">
                {t.location.searchArea}
              </h2>
              <p className="text-xs text-slate-500">{t.common.osmAttribution}</p>
            </div>
            <LocationPickerBar
              showRadius={true}
              onLocationChosen={() => navigate('/explore')}
            />
          </div>
        </section>

        {/* How It Works — 3 editorial steps */}
        <section className="border-t border-slate-200 bg-white py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-[#0F2744]">{t.landing.howItWorksTitle}</h2>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-[#0F2744]">
                  {t.landing.step1Title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {t.landing.step1Desc}
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-[#0F2744]">
                  {t.landing.step2Title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {t.landing.step2Desc}
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-[#0F2744]">
                  {t.landing.step3Title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {t.landing.step3Desc}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Data Honesty Principles */}
        <section className="border-t border-slate-200 py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-[#0F2744]">{t.landing.principlesTitle}</h2>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
                <h3 className="text-base font-semibold text-[#0F2744]">
                  {t.landing.principle1Title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {t.landing.principle1Desc}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
                <h3 className="text-base font-semibold text-[#0F2744]">
                  {t.landing.principle2Title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {t.landing.principle2Desc}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
                <h3 className="text-base font-semibold text-[#0F2744]">
                  {t.landing.principle3Title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {t.landing.principle3Desc}
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-500">
          <p>
            {t.appName} — {t.tagline}
          </p>
          <p>{t.common.coverageHonesty}</p>
        </div>
      </footer>
    </div>
  );
}
