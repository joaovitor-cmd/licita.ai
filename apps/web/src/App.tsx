import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Bell,
  Building2,
  ChevronDown,
  Compass,
  FileStack,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { api, ApiError, send, useResource } from "./api";
import type { Notification, Session } from "./types";
import { ErrorNotice, Loading, SessionContext, ToastProvider } from "./ui";
import { AuthPage } from "./pages/Auth";
import { SimulatorPage } from "./pages/Simulator";
import {DigestPage} from './pages/Digests';
import {CommercialPage} from './pages/Commercial';
import {ThemeToggle} from './theme';
import {
  DashboardPage,
  OpportunitiesPage,
  OpportunityPage,
} from "./pages/Discovery";
import { RadarPage, TrackingPage } from "./pages/Radar";
import {
  CatalogPage,
  DocumentsPage,
  ProfilePage,
  SourcesPage,
  NotificationsPage,
  SettingsPage,
} from "./pages/Operations";
import {WorkspaceSelector} from './pages/Management';
import {FirstSteps} from './FirstSteps';
const nav = [
  { to: "/app", label: "Visão geral", icon: LayoutDashboard, end: true },
  { to: "/app/primeiros-passos", label: "Primeiros passos", icon: Compass },
  { to: "/app/oportunidades", label: "Oportunidades", icon: Compass },
  { to: "/app/radar", label: "Meu radar", icon: Radio },
  { to: "/app/comercial", label: "Histórico comercial", icon: LayoutDashboard },
  { to: "/app/simulador", label: "Simulador", icon: SlidersHorizontal },
  { to: "/app/catalogo", label: "Catálogo", icon: Package },
  { to: "/app/documentos", label: "Documentos", icon: FileStack },
  { to: "/app/perfil", label: "Perfil comercial", icon: SlidersHorizontal },
  { to: "/app/fontes", label: "Fontes de dados", icon: Building2 },
];
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand ${light ? "brand-light" : ""}`}>
      <span className="brand-mark">
        <i />
        <i />
        <i />
      </span>
      <span>
        Licitaro
      </span>
    </span>
  );
}
function Shell({
  session,
  refresh,
}: {
  session: Session;
  refresh: () => Promise<void>;
}) {
  const [mobile, setMobile] = useState(false),
    [narrow, setNarrow] = useState(
      () => window.matchMedia("(max-width:1020px)").matches,
    ),
    [userOpen, setUserOpen] = useState(false),
    [search, setSearch] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const notices = useResource<Notification[]>("/notifications");
  const rights=useResource<{features:string[]}>('/entitlements');
  const navFeature:Record<string,string>={'/app/oportunidades':'discovery','/app/radar':'radar','/app/comercial':'commercialHistory','/app/simulador':'simulator','/app/catalogo':'catalog','/app/documentos':'documents'};
  useEffect(() => {
    const media = window.matchMedia("(max-width:1020px)");
    const change = () => setNarrow(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const unread = notices.data?.filter((n) => !n.read).length || 0;
  useEffect(() => {
    setMobile(false);
    setUserOpen(false);
    notices.reload();
  }, [location.pathname]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setUserOpen(false);
        setMobile(false);
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, []);
  return (
    <SessionContext.Provider value={{ session, refreshSession: refresh }}>
      <div className="app-shell">
        {mobile && (
          <button
            aria-label="Fechar menu"
            className="sidebar-scrim"
            onClick={() => setMobile(false)}
          />
        )}
        <aside
          className={`sidebar ${mobile ? "sidebar-open" : ""}`}
          inert={narrow && !mobile}
        >
          <Link to="/app" className="brand-link" aria-label="Licitaro — início">
            <Brand light />
            <span className="brand-caption">INTELIGÊNCIA COMERCIAL</span>
          </Link>
          <button
            className="sidebar-close icon-button"
            aria-label="Fechar menu"
            onClick={() => setMobile(false)}
          >
            <X size={20} />
          </button>
          <div className="workspace-switch">
            <span className="workspace-avatar">
              {session.organization.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{session.organization.name}</strong>
              <span>
                {session.organization.isDemo
                  ? "Workspace demonstração"
                  : "Workspace da empresa"}
              </span>
            </div>
            <ShieldCheck size={16} />
          </div>
          <WorkspaceSelector/>
          {session.isPlatformAdmin&&<Link className="nav-item" to="/app/admin"><ShieldCheck size={18}/> Gestão de clientes</Link>}
          <div className="nav-label">WORKSPACE</div>
          <nav aria-label="Menu principal">
            {nav.filter(item=>!navFeature[item.to]||rights.data?.features.includes(navFeature[item.to])).map((item, i) => (
              <div key={item.to}>
                {i === 3 && (
                  <div className="nav-label nav-divider">SUA OPERAÇÃO</div>
                )}
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `nav-item ${isActive ? "active" : ""}`
                  }
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-tip">
              <span className="tip-dot" />
              <strong>Da descoberta à decisão.</strong>
              <p>Seu próximo contrato começa com uma boa oportunidade.</p>
              <Link to="/app/oportunidades">
                Explorar oportunidades <Compass size={14} />
              </Link>
            </div>
            <NavLink to="/app/configuracoes" className="nav-item">
              <Settings size={18} />
              <span>Configurações</span>
            </NavLink>
            <div className="sidebar-version">
              PLATAFORMA EM EVOLUÇÃO <span>v2.0</span>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menu"
              onClick={() => setMobile(true)}
            >
              <Menu size={22} />
            </button>
            <div className="topbar-breadcrumb">
              Workspace <span>/</span>{" "}
              <strong>
                {nav.find((n) =>
                  n.end
                    ? location.pathname === n.to
                    : location.pathname.startsWith(n.to),
                )?.label ||
                  (location.pathname.includes("notificacoes")
                    ? "Notificações"
                    : "Configurações")}
              </strong>
            </div>
            <form
              className="global-search"
              onSubmit={(e) => {
                e.preventDefault();
                navigate(`/app/oportunidades?q=${encodeURIComponent(search)}`);
              }}
            >
              <Search size={16} />
              <input
                aria-label="Busca global de editais"
                placeholder="Buscar editais, órgãos…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>↵</kbd>
            </form>
            <Link
              to="/app/notificacoes"
              className="notification-button icon-button"
              aria-label={`Notificações${unread ? `, ${unread} não lidas` : ""}`}
            >
              <Bell size={19} />
              {unread > 0 && <span className="notification-dot" />}
            </Link>
            <ThemeToggle />
            <div className="user-control">
              <button
                className="user-button"
                aria-expanded={userOpen}
                aria-controls="user-menu"
                onClick={() => setUserOpen((v) => !v)}
              >
                <span className="avatar">
                  {session.user.name
                    .split(" ")
                    .slice(0, 2)
                    .map((v) => v[0])
                    .join("")
                    .toUpperCase()}
                </span>
                <span className="user-label">
                  <strong>{session.user.name}</strong>
                  <span>
                    {session.role === "ADMIN" ? "Administrador" : "Membro"}
                  </span>
                </span>
                <ChevronDown size={14} />
              </button>
              {userOpen && (
                <div className="user-menu" id="user-menu">
                  <span>{session.user.email}</span>
                  <Link to="/app/configuracoes">
                    <Settings size={15} /> Minha conta
                  </Link>
                  <button
                    onClick={async () => {
                      await send("/auth/logout", "POST");
                      refresh();
                    }}
                  >
                    <LogOut size={15} /> Sair da plataforma
                  </button>
                </div>
              )}
            </div>
          </header>
          {session.organization.isDemo && (
            <div className="demo-banner">
              <span>
                <span className="demo-pill">DEMONSTRAÇÃO</span>Você está
                explorando dados fictícios. Nenhuma participação será enviada.
              </span>
              <Link to="/cadastro">
                Criar minha conta <span>→</span>
              </Link>
            </div>
          )}
          <main className="page-content" id="main-content">
            <FirstSteps key={`${session.user.id}:${session.organization.id}`} />
            <Outlet />
          </main>
          <footer className="app-footer">
            <span>
              Licitaro <span>Inteligência para fazer bons negócios.</span>
            </span>
            <span>Dados sujeitos à confirmação no portal de origem.</span>
          </footer>
        </div>
      </div>
    </SessionContext.Provider>
  );
}
export function App() {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const refresh = async () => {
    setError("");
    try {
      setSession(await api<Session>("/auth/me"));
    } catch (e) {
      setSession(null);
      if (!(e instanceof ApiError && e.status === 401))
        setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
    const expired = () => setSession(null);
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  if (loading)
    return (
      <div className="boot-screen">
        <Brand />
        <Loading label="Preparando seu workspace…" />
      </div>
    );
  return (
    <ToastProvider>
      <a className="skip-link" href="#main-content">
        Pular para conteúdo
      </a>
      <Routes>
        <Route
          path="/"
          element={<Navigate to={session ? "/app" : "/login"} replace />}
        />
        {["login", "cadastro", "recuperar-senha", "redefinir-senha"].map(
          (mode) => (
            <Route
              key={mode}
              path={`/${mode}`}
              element={
                <AuthPage mode={mode} onAuthenticated={refresh} error={error} />
              }
            />
          ),
        )}
        <Route
          path="/app"
          element={
            session ? (
              <Shell session={session} refresh={refresh} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="oportunidades" element={<OpportunitiesPage />} />
          <Route path="oportunidades/:id" element={<OpportunityPage />} />
          <Route path="radar" element={<RadarPage />} />
          <Route path="simulador" element={<SimulatorPage />} />
          <Route path="radar/:id" element={<TrackingPage />} />
          <Route path="catalogo" element={<CatalogPage />} />
          <Route path="documentos" element={<DocumentsPage />} />
          <Route path="perfil" element={<ProfilePage />} />
          <Route path="primeiros-passos" element={null} />
          <Route path="fontes" element={<SourcesPage />} />
          <Route path="notificacoes" element={<NotificationsPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="boletins/:id" element={<DigestPage />} />
          <Route path="comercial" element={<CommercialPage />} />
        </Route>
        <Route path="/gestao/*" element={<div className="not-found"><Brand/><h1>A gestão tem um acesso separado</h1><p>Use o console administrativo, com sua credencial de gestão.</p><a className="button primary" href={import.meta.env.VITE_CONSOLE_URL || 'http://localhost:5174'}>Abrir console de gestão</a></div>}/>
        <Route
          path="*"
          element={
            <div className="not-found">
              <Brand />
              <h1>Página não encontrada</h1>
              <p>Este endereço não está disponível.</p>
              <Link className="button primary" to="/app">
                Voltar ao workspace
              </Link>
            </div>
          }
        />
      </Routes>
    </ToastProvider>
  );
}
