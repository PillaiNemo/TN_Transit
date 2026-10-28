import { lazy, Suspense, type ComponentType } from 'react';
import { Route, Routes } from 'react-router-dom';
import { RequireAdmin, RequireAuth } from './components/Guards';
import { Spinner } from './components/ui';
import { useGlobalMotion } from './hooks/useMotion';
import { AdminLayout } from './layouts/AdminLayout';
import { AppShellLayout } from './layouts/AppShellLayout';
import { MainLayout } from './layouts/MainLayout';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { CheckoutPage } from './pages/CheckoutPage';
import { HomePage } from './pages/HomePage';
import { ManageBookingPage, NotFoundPage, PoliciesPage, ProfilePage } from './pages/InfoPages';
import { MyBookingsPage } from './pages/MyBookingsPage';
import { SearchPage } from './pages/SearchPage';
import { SeatSelectionPage } from './pages/SeatSelectionPage';
import { TicketPage } from './pages/TicketPage';
// Admin pages (and the charting library) load only when an admin opens them.
const named = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const catalog = () => import('./pages/admin/CatalogPages');
const insights = () => import('./pages/admin/InsightsPages');
const operations = () => import('./pages/admin/OperationsPages');
const CitiesStationsPage = named(catalog, 'CitiesStationsPage');
const RoutesPage = named(catalog, 'RoutesPage');
const OperatorsPage = named(catalog, 'OperatorsPage');
const VehiclesPage = named(catalog, 'VehiclesPage');
const ServicesPage = named(catalog, 'ServicesPage');
const DashboardPage = named(insights, 'DashboardPage');
const ReportsPage = named(insights, 'ReportsPage');
const BookingRecordsPage = named(insights, 'BookingRecordsPage');
const CancellationsPage = named(insights, 'CancellationsPage');
const SchedulesPage = named(operations, 'SchedulesPage');
const SeatConfigPage = named(operations, 'SeatConfigPage');
const FaresPage = named(operations, 'FaresPage');

export default function App() {
  useGlobalMotion();
  return (
    <Suspense fallback={<Spinner />}>
    <Routes>
      {/* Pages with the dark-green sidebar shell */}
      <Route element={<AppShellLayout />}>
        <Route path="search" element={<SearchPage />} />
        <Route path="bookings" element={<RequireAuth><MyBookingsPage /></RequireAuth>} />
        <Route path="profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
      </Route>
      <Route element={<MainLayout />}>
        <Route index element={<HomePage />} />
        <Route path="book/:scheduleId" element={<SeatSelectionPage />} />
        <Route path="checkout/:scheduleId" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
        <Route path="booking/:reference" element={<RequireAuth><TicketPage /></RequireAuth>} />
        <Route path="manage" element={<ManageBookingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="policies" element={<PoliciesPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route index element={<DashboardPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="cities" element={<CitiesStationsPage />} />
        <Route path="routes" element={<RoutesPage />} />
        <Route path="operators" element={<OperatorsPage />} />
        <Route path="vehicles" element={<VehiclesPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="schedules" element={<SchedulesPage />} />
        <Route path="seats" element={<SeatConfigPage />} />
        <Route path="fares" element={<FaresPage />} />
        <Route path="bookings" element={<BookingRecordsPage />} />
        <Route path="cancellations" element={<CancellationsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
