import { lazy, Suspense } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import { FullScreenMessage, Spinner } from './components/ui';
import { TournamentProvider } from './hooks/useTournament';
import { repo } from './data';
import Home from './pages/Home';
import Login from './pages/Login';
import PublicLayout from './pages/public/PublicLayout';
import LiveView from './pages/public/LiveView';
import StandingsView from './pages/public/StandingsView';
import CalendarView from './pages/public/CalendarView';
import PairsView from './pages/public/PairsView';
import PairDetail from './pages/public/PairDetail';
import AwardsView from './pages/public/AwardsView';
import TvMode from './pages/public/TvMode';

const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const ControlPanel = lazy(() => import('./pages/admin/ControlPanel'));
const Registration = lazy(() => import('./pages/admin/Registration'));
const MatchesAdmin = lazy(() => import('./pages/admin/MatchesAdmin'));
const CategoriesAdmin = lazy(() => import('./pages/admin/CategoriesAdmin'));
const SettingsAdmin = lazy(() => import('./pages/admin/SettingsAdmin'));
const ShareAdmin = lazy(() => import('./pages/admin/ShareAdmin'));

function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

/** Carga el torneo por slug y lo expone vía contexto con sincronización en vivo. */
function TournamentRoute() {
  const { slug = '' } = useParams();
  return (
    <TournamentProvider
      slug={slug}
      fallback={({ loading, error }) =>
        loading ? (
          <Loading />
        ) : (
          <FullScreenMessage title="Torneo no encontrado">
            <p className="max-w-md text-slate-400">
              {error ??
                (repo.mode === 'local'
                  ? 'Revisa el enlace. En modo local los torneos solo existen en el navegador donde se crearon; para compartirlos con otros dispositivos configura Supabase.'
                  : 'Revisa el enlace.')}
            </p>
            <Link className="btn-secondary" to="/">
              Ir al inicio
            </Link>
          </FullScreenMessage>
        )
      }
    >
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
    </TournamentProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/t/:slug" element={<TournamentRoute />}>
        <Route path="tv" element={<TvMode />} />
        <Route element={<PublicLayout />}>
          <Route index element={<LiveView />} />
          <Route path="clasificacion" element={<StandingsView />} />
          <Route path="calendario" element={<CalendarView />} />
          <Route path="parejas" element={<PairsView />} />
          <Route path="pareja/:pairId" element={<PairDetail />} />
          <Route path="premiacion" element={<AwardsView />} />
        </Route>
      </Route>
      <Route path="/admin/:slug" element={<TournamentRoute />}>
        <Route element={<AdminLayout />}>
          <Route index element={<ControlPanel />} />
          <Route path="inscripciones" element={<Registration />} />
          <Route path="partidos" element={<MatchesAdmin />} />
          <Route path="categorias" element={<CategoriesAdmin />} />
          <Route path="configuracion" element={<SettingsAdmin />} />
          <Route path="compartir" element={<ShareAdmin />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
