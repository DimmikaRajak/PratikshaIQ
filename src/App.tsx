import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from './i18n/I18nContext';
import { AuthProvider } from './context/AuthContext';
import { LocationProvider } from './context/LocationContext';
import { AppLayout } from './components/layout/AppLayout';
import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { ExploreOfficesPage } from './pages/ExploreOfficesPage';
import { MapExplorerPage } from './pages/MapExplorerPage';
import { OfficeDetailsPage } from './pages/OfficeDetailsPage';
import { SubmitReportPage } from './pages/SubmitReportPage';
import { MyReportsPage } from './pages/MyReportsPage';
import { VisitPlannerPage } from './pages/VisitPlannerPage';
import { SuggestOfficePage } from './pages/SuggestOfficePage';
import { LoginPage } from './pages/LoginPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthProvider>
          <LocationProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route element={<AppLayout />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/explore" element={<ExploreOfficesPage />} />
                  <Route path="/map" element={<MapExplorerPage />} />
                  <Route path="/office/:slug" element={<OfficeDetailsPage />} />
                  <Route path="/report" element={<SubmitReportPage />} />
                  <Route path="/my-reports" element={<MyReportsPage />} />
                  <Route path="/planner" element={<VisitPlannerPage />} />
                  <Route path="/suggest-office" element={<SuggestOfficePage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/admin" element={<AdminDashboardPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </LocationProvider>
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
