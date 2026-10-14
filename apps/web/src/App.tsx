import { lazy,Suspense,useEffect, useState } from "react";
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
  ChevronLeft,
  ChevronRight,
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
import { ErrorNotice, Loading, SessionContext, ToastProvider,useToast } from "./ui";
import {useDeparture} from './Departure';
import { AuthPage } from "./pages/Auth";
const DigestPage=lazy(()=>import('./pages/Digests').then(module=>({default:module.DigestPage})));
const CommercialPage=lazy(()=>import('./pages/Commercial').then(module=>({default:module.CommercialPage})));
import {ThemeToggle} from './theme';
import {NotificationsModal} from './NotificationsModal';
import {
  DashboardPage,
  OpportunitiesPage,
  OpportunityPage,
} from "./pages/Discovery";
const RadarPage=lazy(()=>import('./pages/Radar').then(module=>({default:module.RadarPage})));
const TrackingPage=lazy(()=>import('./pages/Radar').then(module=>({default:module.TrackingPage})));
const CatalogPage=lazy(()=>import('./pages/Operations').then(module=>({default:module.CatalogPage})));
const PriceRecordsPage=lazy(()=>import('./pages/PriceRecords').then(module=>({default:module.PriceRecordsPage})));
const DocumentsPage=lazy(()=>import('./pages/Operations').then(module=>({default:module.DocumentsPage})));
const ProfilePage=lazy(()=>import('./pages/Operations').then(module=>({default:module.ProfilePage})));
const SourcesPage=lazy(()=>import('./pages/Operations').then(module=>({default:module.SourcesPage})));
const NotificationsPage=lazy(()=>import('./pages/Operations').then(module=>({default:module.NotificationsPage})));
const SettingsPage=lazy(()=>import('./pages/Operations').then(module=>({default:module.SettingsPage})));
import {WorkspaceSelector} from './pages/Management';
import {FirstSteps} from './FirstSteps';
import {PreferredHome} from './pages/UserPreferences';
const nav = [
  { to: "/app/visao-geral", label: "Visão geral", icon: LayoutDashboard, end: true },
  { to: "/app/oportunidades", label: "Oportunidades", icon: Compass },
  { to: "/app/radar", label: "Meu radar", icon: Radio },
  { to: "/app/comercial", label: "Histórico comercial", icon: LayoutDashboard },
  { to: "/app/catalogo", label: "Catálogo", icon: Package },
  { to: "/app/documentos", label: "Documentos", icon: FileStack },
  { to: "/app/atas-precos", label: "Atas de preços", icon: FileStack },
  { to: "/app/perfil", label: "Perfil comercial", icon: SlidersHorizontal },
  { to: "/app/empresa", label: "Dados da empresa", icon: Building2 },
  { to: "/app/fontes", label: "Fontes de dados", icon: Building2 },
];
const CompanyDetailsPage=lazy(()=>import('./pages/CompanyDetails'));
const AgencyWatchesPage=lazy(()=>import('./pages/AgencyWatches'));
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
  const [mobilePath, setMobilePath] = useState<string|null>(null),
    [narrow, setNarrow] = useState(
      () => window.matchMedia("(max-width:1020px)").matches,
    ),
    [userOpen, setUserOpen] = useState(false),
    [search, setSearch] = useState("");
  const [sidebarCollapsed,setSidebarCollapsed]=useState(()=>{
    try{return localStorage.getItem('licitaro-sidebar-collapsed')==='true';}catch{return false;}
  });
  function toggleSidebar(){
    const next=!sidebarCollapsed;setSidebarCollapsed(next);
    try{localStorage.setItem('licitaro-sidebar-collapsed',String(next));}catch{/* The menu still works when storage is unavailable. */}
  }
  const navigate = useNavigate();
  const departure=useDeparture(),toast=useToast();
  const location = useLocation();
  const mobile=mobilePath===location.pathname;
  const notices = useResource<Notification[]>("/notifications");
  const rights=useResource<{features:string[]}>('/entitlements');
  const navFeature:Record<string,string>={'/app/oportunidades':'discovery','/app/radar':'radar','/app/comercial':'commercialHistory','/app/catalogo':'catalog','/app/documentos':'documents','/app/atas-precos':'documents'};
  useEffect(() => {
    const media = window.matchMedia("(max-width:1020px)");
    const change = () => setNarrow(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const [notificationsOpen,setNotificationsOpen]=useState(false);
  const unread = notices.data?.filter((n) => !n.read).length || 0;
  useEffect(() => {
    // Lazy navigation may commit after the address changes. Keep an explicit
    // menu opening for that current address, rather than closing it afterward.
    setMobilePath(path=>path===window.location.pathname?path:null);
    setUserOpen(false);
  }, [location.pathname]);
  useEffect(()=>{notices.reload();},[location.pathname]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setUserOpen(false);
        setMobilePath(null);
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, []);
  return (
    <SessionContext.Provider value={{ session, refreshSession: refresh }}>
      <div className={`app-shell ${sidebarCollapsed&&!narrow ? "sidebar-collapsed" : ""}`}>
        {mobile && (
          <button
            aria-label="Fechar menu"
            className="sidebar-scrim"
            onClick={() => setMobilePath(null)}
          />
        )}
        <aside
          id="main-sidebar"
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
            onClick={() => setMobilePath(null)}
          >
            <X size={20} />
          </button>
          <div className="sidebar-workspaces"><WorkspaceSelector/></div>
          {session.isPlatformAdmin&&<Link className="nav-item" to="/app/admin"><ShieldCheck size={18}/> Gestão de clientes</Link>}
          <div className="nav-label">WORKSPACE</div>
          <nav aria-label="Menu principal">
            {nav.filter(item=>!navFeature[item.to]||rights.data?.features.includes(navFeature[item.to])).map((item, i) => (
              <div key={item.to}>
                {i === 3 && (
                  <div className="nav-label nav-divider">SUA OPERAÇÃO</div>
                )}
                <NavLink
                  aria-label={item.label}
                  title={sidebarCollapsed&&!narrow?item.label:undefined}
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
            <NavLink to="/app/configuracoes" className="nav-item" aria-label="Configurações" title={sidebarCollapsed&&!narrow?"Configurações":undefined}>
              <Settings size={18} />
              <span>Configurações</span>
            </NavLink>
            <div className="sidebar-version">
              PLATAFORMA EM EVOLUÇÃO <span>v2.0</span>
            </div>
          </div>
        </aside>
        {notificationsOpen&&<NotificationsModal items={notices.data??[]} loading={notices.loading} error={notices.error} reload={notices.reload} onClose={()=>setNotificationsOpen(false)} onRead={id=>{notices.setData(previous=>previous?.map(n=>!id||n.id===id?{...n,read:true}:n)??null);}}/>}
            <button type="button" className="icon-button sidebar-toggle sidebar-edge-toggle" aria-label={sidebarCollapsed?'Expandir menu lateral':'Recolher menu lateral'} title={sidebarCollapsed?'Expandir menu lateral':'Recolher menu lateral'} aria-expanded={!sidebarCollapsed} aria-controls="main-sidebar" onClick={toggleSidebar}>
              {sidebarCollapsed?<ChevronRight size={16}/>:<ChevronLeft size={16}/>}
            </button>
        <div className="main-shell">
          <header className="topbar">

            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menu"
              onClick={() => setMobilePath(window.location.pathname)}
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
                  (location.pathname.includes("monitoramentos") ? "Órgãos monitorados" : location.pathname.includes("notificacoes")
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
            <button
              type="button"
              onClick={()=>{setNotificationsOpen(true);notices.reload();}}
              className="notification-button icon-button"
              aria-label={`Notificações${unread ? `, ${unread} não lidas` : ""}`}
            >
              <Bell size={19} />
              {unread > 0 && <span className="notification-count" aria-hidden="true">{unread>99?"99+":unread}</span>}
            </button>
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
                    disabled={departure.departing}
                    onClick={async () => {
                      try{await departure.run(async commit=>{await send("/auth/logout", "POST");commit();await refresh();},'Sair da plataforma?');}
                      catch(error){toast((error as Error).message,true);}
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
            <Suspense fallback={<Loading label="Abrindo tela…"/>}><Outlet /></Suspense>
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
          <Route index element={<PreferredHome />} />
          <Route path="visao-geral" element={<DashboardPage />} />
          <Route path="oportunidades" element={<OpportunitiesPage />} />
          <Route path="oportunidades/:id" element={<OpportunityPage />} />
          <Route path="radar" element={<RadarPage />} />
          <Route path="simulador" element={<Navigate to="/app/radar" replace />} />
          <Route path="radar/:id" element={<TrackingPage />} />
          <Route path="catalogo" element={<CatalogPage />} />
          <Route path="documentos" element={<DocumentsPage />} />
          <Route path="atas-precos" element={<PriceRecordsPage />} />
          <Route path="perfil" element={<ProfilePage />} />
          <Route path="empresa" element={<Suspense fallback={<Loading/>}><CompanyDetailsPage/></Suspense>} />
          <Route path="monitoramentos" element={<Suspense fallback={<Loading/>}><AgencyWatchesPage/></Suspense>} />
          <Route path="primeiros-passos" element={<Navigate to="/app" replace />} />
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
