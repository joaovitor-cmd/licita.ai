import {useConsole} from './session';
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { send, useResource, date } from "./api";
import {
  Button,
  CheckRow,
  Field,
  ErrorNotice,
  Loading,
  useToast,
} from "../../web/src/ui";
type Config = {
  enabled: boolean;
  host: string;
  port: number;
  mode: "starttls" | "tls" | "local";
  username: string;
  fromEmail: string;
  fromName: string;
  hasPassword: boolean;
  verifiedAt: string | null;
  serverConfigured: boolean;
};
const initial = {
  enabled: true,
  host: "",
  port: 587,
  mode: "starttls" as Config["mode"],
  username: "",
  password: "",
  fromEmail: "",
  fromName: "Licitaro",
  authMode: "smtp" as "smtp" | "none",
};
export function EmailSettingsPanel({ onChanged = () => {} }: { onChanged?: () => void }) {
  const resource = useResource<Config>("/management/email-settings");
  const { session } = useConsole(),
    toast = useToast();
  const [form, setForm] = useState(initial),
    [busy, setBusy] = useState(false),
    [showPassword, setShowPassword] = useState(false),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (resource.data) {
      const d = resource.data;
      setForm({
        enabled: d.host ? d.enabled : true,
        host: d.host,
        port: d.port,
        mode: d.mode,
        username: d.username,
        password: "",
        fromEmail: d.fromEmail,
        fromName: d.fromName,
        authMode: d.host && !d.username ? "none" : "smtp",
      });
      setDirty(false);
    }
  }, [resource.data]);
  const disabled = busy || session.adminRole !== 'OWNER' || resource.loading;
  function update(key: keyof typeof initial, value: string | number | boolean) {
    setForm((p) => ({ ...p, [key]: value }));
    setDirty(true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { authMode, ...settings } = form;
      await send("/management/email-settings", "PUT", {
        ...settings,
        username: authMode === "smtp" ? form.username : "",
        password: authMode === "smtp" ? form.password : "",
      });
      setShowPassword(false);
      setForm((p) => ({ ...p, password: "" }));
      resource.reload();
      onChanged();
      toast("Serviço salvo. Envie um teste antes de ativar os alertas.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    try {
      const response = await send<{ message: string }>(
        "/management/email-settings/test",
        "POST",
        {},
      );
      toast(response.message);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      resource.reload();
      onChanged();
      setBusy(false);
    }
  }
  if (resource.loading && !resource.data) return <Loading />;
  return (
    <section
      className="card form-section smtp-panel"
      style={{ marginBottom: 24 }}
    >
      <div className="section-heading">
        <div>
          <h2>Servidor SMTP</h2>
          <p>
            Configure o SMTP compartilhado por todos os ambientes e substitua o provedor
            quando quiser.
          </p>
        </div>
      </div>
      {resource.error && (
        <ErrorNotice message={resource.error} onRetry={resource.reload} />
      )}
      <form onSubmit={save}>
        <fieldset
          disabled={disabled || !!resource.error}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <CheckRow
            checked={form.enabled}
            onChange={(v) => update("enabled", v)}
          >
            Ativar o envio central para todos os ambientes
          </CheckRow>
          <div className="smtp-grid">
            <Field label="Endereço do servidor">
              <input
                required
                value={form.host}
                placeholder="smtp.seuprovedor.com"
                autoComplete="off"
                onChange={(e) => update("host", e.target.value)}
              />
            </Field>
            <Field label="Porta">
              <input
                type="number"
                required
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => update("port", Number(e.target.value))}
              />
            </Field>
            <Field label="Modo de autenticação">
              <select
                aria-label="Modo de autenticação"
                value={form.authMode}
                onChange={(e) => {
                  setShowPassword(false);
                  update("authMode", e.target.value);
                }}
              >
                <option value="smtp">Autenticação SMTP</option>
                <option value="none">Sem autenticação</option>
              </select>
            </Field>
            <Field label="Conexão segura">
              <select
                aria-label="Conexão segura"
                value={form.mode}
                onChange={(e) => update("mode", e.target.value)}
              >
                <option value="starttls">STARTTLS</option>
                <option value="tls">SSL/TLS</option>
                <option value="local">
                  Sem TLS — somente localhost de desenvolvimento
                </option>
              </select>
            </Field>
            <Field label="Usuário">
              <input
                required={form.authMode === "smtp"}
                disabled={form.authMode === "none"}
                value={form.username}
                autoComplete="off"
                placeholder="Usuário fornecido pelo serviço"
                onChange={(e) => update("username", e.target.value)}
              />
            </Field>
            <div className="field smtp-password-field">
              <label className="field-label" htmlFor="smtp-password">
                Senha
              </label>
              <div className="smtp-password-control">
                <input
                  id="smtp-password"
                  type={showPassword ? "text" : "password"}
                  disabled={form.authMode === "none"}
                  value={form.password}
                  autoComplete="new-password"
                  placeholder={
                    resource.data?.hasPassword
                      ? "Senha salva; deixe vazio para manter"
                      : "Informe a senha do serviço"
                  }
                  onChange={(e) => {
                    if (!e.target.value) setShowPassword(false);
                    update("password", e.target.value);
                  }}
                />
                <button
                  type="button"
                  className="smtp-password-toggle"
                  aria-label={
                    showPassword
                      ? "Ocultar senha digitada"
                      : "Mostrar senha digitada"
                  }
                  aria-pressed={showPassword}
                  disabled={form.authMode === "none" || !form.password}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <Field label="Remetente">
              <input
                type="email"
                required
                value={form.fromEmail}
                placeholder="alertas@suaempresa.com.br"
                onChange={(e) => update("fromEmail", e.target.value)}
              />
            </Field>
            <Field label="Servidor POP3">
              <input
                disabled
                placeholder="Servidor POP3"
                title="Não utilizado no envio por SMTP"
              />
            </Field>
            <Field label="Porta POP3">
              <input
                disabled
                placeholder="Porta POP3"
                title="Não utilizada no envio por SMTP"
              />
            </Field>
          </div>
          <p className="muted small">
            POP3 não é utilizado nesta integração de envio. SSL/TLS normalmente
            usa a porta 465; STARTTLS, a 587. Confirme os dados com o seu
            provedor.
          </p>
          {form.authMode === "none" && resource.data?.hasPassword && (
            <p className="info-note">
              Ao salvar sem autenticação, o usuário e a senha armazenados serão
              removidos da configuração.
            </p>
          )}
          <details className="smtp-extra">
            <summary>Opções adicionais</summary>
            <Field label="Nome do remetente">
              <input
                required
                maxLength={100}
                value={form.fromName}
                onChange={(e) => update("fromName", e.target.value)}
              />
            </Field>
          </details>
          <p className="muted small">
            A senha é armazenada criptografada e não é devolvida à interface.
            Use credenciais de teste ou uma senha de aplicativo. O remetente
            precisa ser autorizado pelo seu provedor.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Button type="submit" busy={busy}>
              Salvar serviço de e-mail
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={test}
              disabled={dirty || !resource.data?.host || !form.enabled}
              busy={busy}
            >
              Enviar e-mail de teste
            </Button>
          </div>
        </fieldset>
      </form>
      <p className="muted small" role="status">
        {resource.data?.verifiedAt
          ? `Último teste aceito pelo servidor: ${date(resource.data.verifiedAt, true)}. Confira o recebimento na caixa de entrada ou spam.`
          : resource.data?.serverConfigured && !resource.data.host
            ? "Há um serviço padrão configurado no servidor. Ao salvar um serviço próprio, ele passará a ser usado por todos os ambientes."
            : "Salve e teste o serviço para habilitar o envio central. As preferências de alertas continuam em cada empresa."}
      </p>
      <p className="muted small">
        O teste será enviado somente para {session.user.email}. Este serviço atende todos os ambientes, incluindo alertas, boletins e recuperação de senha.
      </p>
    </section>
  );
}
