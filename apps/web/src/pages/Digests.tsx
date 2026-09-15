import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { date, send, useResource } from "../api";
import { Button, CheckRow, ErrorNotice, Field, Loading, useToast } from "../ui";
type Settings = {
  enabled: boolean;
  sendTime: string;
  recipientIds: string[];
  revision: number;
  emailEnabled: boolean;
  smtpConfigured: boolean;
  isDemo: boolean;
};
type Item = {
  id: string;
  title: string;
  agency: string;
  state: string | null;
  score: number;
};
type Run = {
  id: string;
  run_day: string;
  scanned: number;
  remaining: boolean;
  count: number;
  created_at: string;
};
type Preview = {
  count: number;
  scanned: number;
  remaining: boolean;
  items: Item[];
  notice: string;
};
export function DigestSettingsPanel() {
  const resource = useResource<Settings>("/digest-settings"),
    members =
      useResource<{ id: string; name: string; role: string }[]>("/members"),
    history = useResource<Run[]>("/digests");
  const [form, setForm] = useState({
      enabled: false,
      sendTime: "08:00",
      recipientIds: [] as string[],
      revision: 0,
    }),
    [allAdmins, setAllAdmins] = useState(true),
    [busy, setBusy] = useState(false),
    [previewBusy, setPreviewBusy] = useState(false),
    [preview, setPreview] = useState<Preview | null>(null);
  const toast = useToast();
  useEffect(() => {
    if (resource.data) {
      const s = resource.data;
      setForm({
        enabled: s.enabled,
        sendTime: s.sendTime,
        recipientIds: s.recipientIds,
        revision: s.revision,
      });
      setAllAdmins(!s.recipientIds.length);
    }
  }, [resource.data]);
  async function save() {
    if (!allAdmins && !form.recipientIds.length) {
      toast("Selecione ao menos um administrador ou escolha todos.", true);
      return;
    }
    setBusy(true);
    try {
      await send("/digest-settings", "PUT", {
        ...form,
        recipientIds: allAdmins ? [] : form.recipientIds,
      });
      resource.reload();
      history.reload();
      setPreview(null);
      toast(
        "Configuração do boletim salva. Nenhum envio de teste foi realizado.",
      );
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function showPreview() {
    setPreviewBusy(true);
    try {
      setPreview(await send<Preview>("/digest-preview", "GET"));
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setPreviewBusy(false);
    }
  }
  return (
    <section className="card form-section digest-settings">
      <h2>Boletim diário de oportunidades</h2>
      <p>
        Receba um resumo em vez de e-mails a cada coleta. Alertas de prazos,
        documentos e alterações do radar continuam separados.
      </p>
      {resource.error && (
        <ErrorNotice message={resource.error} onRetry={resource.reload} />
      )}
      {members.error && (
        <ErrorNotice message={members.error} onRetry={members.reload} />
      )}
      <p className="info-note">
        Usa seu perfil comercial, catálogo e a aderência mínima configurada nas
        preferências, avaliados na geração. Nenhum edital antigo é enviado ao
        ativar. A prévia não envia e-mail.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <CheckRow
          checked={form.enabled}
          disabled={busy || resource.loading || !!resource.data?.isDemo}
          onChange={(v) => setForm((p) => ({ ...p, enabled: v }))}
        >
          Agrupar novos editais em um boletim diário por e-mail
        </CheckRow>
        <p className="muted small">
          {resource.data?.isDemo
            ? "Na demonstração, é possível salvar horário e destinatários e consultar a prévia, mas não ativar envios."
            : resource.data?.emailEnabled && resource.data.smtpConfigured
              ? "Canal de e-mail habilitado e serviço disponível."
              : "Antes de ativar, configure e teste o SMTP e habilite o canal de e-mail nas preferências abaixo. Use Atualizar configuração após essas alterações."}
        </p>
        <Field label="Horário do boletim — Brasília">
          <input
            type="time"
            aria-label="Horário do boletim — Brasília"
            value={form.sendTime}
            required
            disabled={busy || resource.loading}
            onChange={(e) =>
              setForm((p) => ({ ...p, sendTime: e.target.value }))
            }
          />
        </Field>
        <Field label="Destinatários do boletim">
          <select
            aria-label="Destinatários do boletim"
            value={allAdmins ? "all" : "selected"}
            disabled={busy || resource.loading}
            onChange={(e) => setAllAdmins(e.target.value === "all")}
          >
            <option value="all">
              Todos os administradores atuais da empresa
            </option>
            <option value="selected">Administradores selecionados</option>
          </select>
        </Field>
        {!allAdmins && (
          <fieldset className="digest-recipients">
            <legend>Quem deve receber?</legend>
            {members.data
              ?.filter((m) => m.role === "ADMIN")
              .map((m) => (
                <CheckRow
                  key={m.id}
                  checked={form.recipientIds.includes(m.id)}
                  disabled={busy}
                  onChange={(v) =>
                    setForm((p) => ({
                      ...p,
                      recipientIds: v
                        ? [...p.recipientIds, m.id]
                        : p.recipientIds.filter((id) => id !== m.id),
                    }))
                  }
                >
                  {m.name}
                </CheckRow>
              ))}
          </fieldset>
        )}
        <p className="muted small">
          O servidor precisa estar ligado. Após o horário escolhido, prepara no
          máximo um boletim por dia; se não houver novidades aderentes, registra
          a verificação sem enviar e-mail. Não recupera um envio separado para
          cada dia em que ficou desligado. Ao desativar, envios já em andamento
          podem não ser interrompidos.
        </p>
        <div className="button-row">
          <Button
            type="submit"
            busy={busy}
            disabled={resource.loading || !!resource.error || !!members.error}
          >
            Salvar boletim
          </Button>
          <Button
            type="button"
            variant="secondary"
            busy={previewBusy}
            onClick={showPreview}
          >
            Ver prévia sem enviar
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              resource.reload();
              members.reload();
              history.reload();
            }}
          >
            Atualizar configuração
          </Button>
        </div>
      </form>
      {preview && (
        <section aria-label="Prévia do boletim">
          <h3>Prévia — nenhum e-mail enviado</h3>
          <p>{preview.notice} Considera as configurações já salvas.</p>
          <p>
            {preview.count} oportunidades aderentes em {preview.scanned}{" "}
            registros consultados.
          </p>
          {preview.remaining && (
            <p className="info-note">
              Consulta limitada a 2.000 registros. Há registros adicionais para
              uma próxima verificação.
            </p>
          )}
          {!preview.items.length ? (
            <p className="muted">
              Nenhuma oportunidade aderente neste período. Isso não comprova
              ausência de publicações nas fontes oficiais.
            </p>
          ) : (
            <DigestItems items={preview.items} />
          )}
        </section>
      )}
      <details>
        <summary>Últimas verificações do boletim</summary>
        {history.error && (
          <ErrorNotice message={history.error} onRetry={history.reload} />
        )}
        <p className="muted small">
          Preparar o boletim não comprova entrega. Consulte o histórico de envio
          de e-mails abaixo para acompanhar cada destinatário.
        </p>
        {!history.data?.length && <p>Nenhum boletim preparado ainda.</p>}
        <ul>
          {history.data?.map((r) => (
            <li key={r.id}>
              <Link to={`/app/boletins/${r.id}`}>
                {r.run_day} · {r.count} oportunidades
              </Link>{" "}
              —{" "}
              {r.count
                ? "Preparado; consulte a fila de e-mail"
                : "Sem novidades; nenhum e-mail gerado"}
              {r.remaining ? " · consulta parcial" : ""}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
function DigestItems({ items }: { items: Item[] }) {
  return (
    <ul className="digest-items">
      {items.map((i) => (
        <li key={i.id}>
          <Link to={`/app/oportunidades/${i.id}`}>{i.title}</Link>
          <p>
            {i.agency} · {i.state ?? "UF não informada"} · aderência {i.score}%
          </p>
        </li>
      ))}
    </ul>
  );
}
export function DigestPage() {
  const { id } = useParams();
  return <DigestDetail key={id} id={id!} />;
}
function DigestDetail({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const resource = useResource<{
    run_day: string;
    scanned: number;
    remaining: boolean;
    total: number;
    pages: number;
    items: Item[];
    created_at: string;
  }>(`/digests/${id}?page=${page}`);
  if (resource.loading) return <Loading />;
  if (resource.error)
    return <ErrorNotice message={resource.error} onRetry={resource.reload} />;
  const r = resource.data;
  if (!r) return null;
  return (
    <section className="card form-section">
      <Link to="/app/configuracoes">Voltar às configurações</Link>
      <h1>Boletim de oportunidades · {r.run_day}</h1>
      <p>
        {r.total} oportunidades aderentes · {r.scanned} registros avaliados ·
        preparado em {date(r.created_at, true)}
      </p>
      <p className="info-note">
        Esta lista preserva a aderência calculada na geração. Os dados e prazos
        podem ter mudado; abra a oportunidade para conferir a situação atual.
        Não é aprovação para participar.
      </p>
      {r.remaining && (
        <p>
          Há registros adicionais para avaliação no próximo boletim. O limite
          por verificação é de 2.000 registros.
        </p>
      )}
      {!r.total ? (
        <p>
          Não houve novidades aderentes nesta verificação. Nenhum e-mail foi
          gerado.
        </p>
      ) : (
        <DigestItems items={r.items} />
      )}
      <div className="button-row">
        <Button
          variant="secondary"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </Button>
        <span>
          Página {page} de {r.pages}
        </span>
        <Button
          variant="secondary"
          disabled={page >= r.pages}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </Button>
      </div>
    </section>
  );
}
