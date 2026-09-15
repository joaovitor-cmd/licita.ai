import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { send } from "../api";
import { Brand } from "../App";
import { Button, ErrorNotice, Field } from "../ui";
export function AuthPage({
  mode,
  onAuthenticated,
  error: globalError,
}: {
  mode: string;
  onAuthenticated: () => Promise<void>;
  error?: string;
}) {
  const navigate = useNavigate(),
    [params] = useSearchParams();
  const signup = mode === "cadastro",
    forgot = mode === "recuperar-senha",
    reset = mode === "redefinir-senha";
  const [name, setName] = useState(""),
    [organizationName, setOrganization] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [demoBusy, setDemoBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (forgot || reset) {
        const result = await send<{ message: string }>(
          forgot ? "/auth/forgot-password" : "/auth/reset-password",
          "POST",
          forgot ? { email } : { token: params.get("token") || "", password },
        );
        setMessage(result.message);
      } else {
        const result=await send<{isPlatformAdmin?:boolean}>(
          signup ? "/auth/register" : "/auth/login",
          "POST",
          signup
            ? { name, organizationName, email, password }
            : { email, password },
        );
        await onAuthenticated();
        navigate(signup ? "/app/perfil" : "/app");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function demo() {
    setDemoBusy(true);
    setError("");
    try {
      await send("/auth/demo", "POST");
      await onAuthenticated();
      navigate("/app");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDemoBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <Brand light />
        <div className="auth-story-content">
          <span className="auth-eyebrow">
            <span /> INTELIGÊNCIA EM LICITAÇÕES
          </span>
          <h1>
            Oportunidades certas.
            <br />
            <em>Decisões melhores.</em>
          </h1>
          <p>
            Conecte sua empresa às compras públicas e transforme informação em
            uma operação comercial organizada.
          </p>
          <div className="auth-feature">
            <span>
              <Check size={17} />
            </span>
            <div>
              <strong>Descubra com contexto</strong>
              <p>Editais alinhados ao que sua empresa oferece.</p>
            </div>
          </div>
          <div className="auth-feature">
            <span>
              <Check size={17} />
            </span>
            <div>
              <strong>Prepare sua participação</strong>
              <p>Prazos, documentos e equipe no mesmo lugar.</p>
            </div>
          </div>
          <div className="auth-feature">
            <span>
              <Check size={17} />
            </span>
            <div>
              <strong>Acompanhe o que muda</strong>
              <p>Histórico e atualizações para apoiar suas decisões.</p>
            </div>
          </div>
        </div>
        <div className="auth-footer">
          <ShieldCheck size={16} />
          <span>Um workspace privado para sua empresa.</span>
          <span>BRASIL</span>
        </div>
        <div className="auth-orbit orbit-one" />
        <div className="auth-orbit orbit-two" />
      </section>
      <section className="auth-form-side">
        <Link className="auth-mobile-brand" to="/">
          <Brand />
        </Link>
        <div className="auth-form-container">
          <div className="eyebrow">
            {forgot || reset
              ? "ACESSO SEGURO"
              : signup
                ? "SEU PRÓXIMO PASSO"
                : "BEM-VINDO DE VOLTA"}
          </div>
          <h2>
            {forgot
              ? "Recupere seu acesso"
              : reset
                ? "Defina uma nova senha"
                : signup
                  ? "Comece um novo capítulo."
                  : "Seu workspace espera por você."}
          </h2>
          <p>
            {forgot
              ? "Informe o e-mail da sua conta. As instruções serão enviadas se houver um cadastro e o envio estiver configurado."
              : reset
                ? "Escolha uma senha forte para proteger sua conta."
                : signup
                  ? "Crie sua conta e organize sua atuação no mercado público."
                  : "Entre para acompanhar oportunidades e dar andamento às suas propostas."}
          </p>
          {(error || globalError) && (
            <ErrorNotice message={error || globalError || ""} />
          )}{" "}
          {message && (
            <div className="success-notice" role="status">
              {message}
            </div>
          )}
          <form onSubmit={submit} className="auth-form">
            {signup && (
              <>
                <Field label="Seu nome" required>
                  <input
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                    maxLength={120}
                    placeholder="Como podemos chamar você?"
                  />
                </Field>
                <Field label="Nome da empresa" required>
                  <input
                    autoComplete="organization"
                    value={organizationName}
                    onChange={(e) => setOrganization(e.target.value)}
                    required
                    minLength={2}
                    maxLength={160}
                    placeholder="Razão social ou nome fantasia"
                  />
                </Field>
              </>
            )}
            {!reset && (
              <Field label="E-mail profissional" required>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={254}
                  placeholder="voce@empresa.com.br"
                />
              </Field>
            )}
            {!forgot && (
              <Field
                label="Senha"
                required
                hint={
                  signup || reset
                    ? "Use no mínimo 8 caracteres. Prefira uma senha longa e única."
                    : undefined
                }
              >
                <div className="password-input">
                  <input
                    type={visible ? "text" : "password"}
                    autoComplete={
                      signup || reset ? "new-password" : "current-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={signup || reset ? 8 : 1}
                    maxLength={128}
                    placeholder={
                      signup || reset ? "Crie uma senha segura" : "Sua senha"
                    }
                  />
                  <button
                    type="button"
                    aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
                    onClick={() => setVisible((v) => !v)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>
            )}
            {!signup && !forgot && !reset && (
              <Link className="forgot-link" to="/recuperar-senha">
                Esqueci minha senha
              </Link>
            )}
            <Button
              type="submit"
              busy={busy}
              disabled={demoBusy || (reset && !params.get("token"))}
            >
              {forgot
                ? "Enviar instruções"
                : reset
                  ? "Salvar nova senha"
                  : signup
                    ? "Criar meu workspace"
                    : "Entrar no workspace"}
              <ArrowRight size={17} />
            </Button>
            {reset && !params.get("token") && (
              <ErrorNotice message="Link de recuperação incompleto. Solicite um novo link." />
            )}
          </form>
          {forgot || reset ? (
            <p className="auth-switch">
              <Link to="/login">Voltar para o login</Link>
            </p>
          ) : (
            <>
              <p className="auth-switch">
                {signup ? "Já tem uma conta?" : "Ainda não tem uma conta?"}{" "}
                <Link to={signup ? "/login" : "/cadastro"}>
                  {signup ? "Entrar" : "Criar workspace"}
                </Link>
              </p>
              <div className="auth-divider">
                <span>OU CONHEÇA PRIMEIRO</span>
              </div>
              <Button
                variant="secondary"
                className="full-width"
                busy={demoBusy}
                disabled={busy}
                onClick={demo}
              >
                Explorar demonstração <ArrowRight size={16} />
              </Button>
              <p className="demo-disclaimer">
                Ambiente isolado com dados fictícios. Sem cartão, sem
                compromisso.
              </p>
            </>
          )}
          <div className="auth-security">
            <LockKeyhole size={13} /> Seus dados pertencem à sua empresa.
          </div>
        </div>
      </section>
    </div>
  );
}
