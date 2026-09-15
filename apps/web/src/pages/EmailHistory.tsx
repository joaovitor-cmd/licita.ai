import { useEffect, useState } from "react";
import { date, send, useResource } from "../api";
import { Button, ErrorNotice, useToast } from "../ui";
type Entry = {
  id: string;
  recipient: string;
  subject: string;
  status: string;
  attempts: number;
  next_attempt_at: string;
  accepted_at: string | null;
  last_error: string | null;
  created_at: string;
};
const labels: Record<string, string> = {
  PENDING: "Na fila",
  SENDING: "Enviando",
  SENT: "Aceito pelo SMTP",
  FAILED: "Falhou",
  UNKNOWN: "Resultado incerto",
  BLOCKED: "Aguardando configuração",
  CANCELLED: "Cancelado",
};
export function EmailHistory() {
  const [page, setPage] = useState(1),
    [busy, setBusy] = useState<string | null>(null),
    [confirm, setConfirm] = useState<string | null>(null);
  const toast = useToast();
  const resource = useResource<{
    items: Entry[];
    total: number;
    page: number;
    pages: number;
  }>(`/email-deliveries?page=${page}`);
  useEffect(() => {
    const timer = setInterval(() => resource.reload(), 15000);
    return () => clearInterval(timer);
  }, [page]);
  async function retry(item: Entry) {
    if (item.status === "UNKNOWN" && confirm !== item.id) {
      setConfirm(item.id);
      return;
    }
    setBusy(item.id);
    try {
      await send(`/email-deliveries/${item.id}/retry`, "POST", {
        confirmUnknown: item.status === "UNKNOWN",
      });
      setConfirm(null);
      resource.reload();
      toast("Envio recolocado na fila.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section
      className="card form-section email-history"
      style={{ marginBottom: 24 }}
    >
      <div className="section-heading">
        <div>
          <h2>Histórico de e-mails</h2>
          <p>
            Acompanhe os alertas enviados pela plataforma e as tentativas
            pendentes.
          </p>
        </div>
        <Button variant="secondary" onClick={resource.reload}>
          Atualizar histórico
        </Button>
      </div>
      <p className="muted small">
        “Aceito pelo SMTP” não comprova chegada à caixa de entrada. Falhas
        temporárias têm até três tentativas por ciclo. Envios com resultado
        incerto exigem sua confirmação antes de reenviar.
      </p>
      {resource.error && (
        <ErrorNotice message={resource.error} onRetry={resource.reload} />
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mensagem</th>
              <th>Destinatário</th>
              <th>Situação</th>
              <th>Tentativas</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {resource.data?.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.subject}</strong>
                  <p className="muted small">{date(item.created_at, true)}</p>
                </td>
                <td>{item.recipient}</td>
                <td>
                  <span>{labels[item.status] ?? item.status}</span>
                  {item.last_error && (
                    <p className="muted small">{item.last_error}</p>
                  )}
                  {item.status === "PENDING" && (
                    <p className="muted small">
                      Próxima tentativa: {date(item.next_attempt_at, true)}
                    </p>
                  )}
                </td>
                <td>{item.attempts}</td>
                <td>
                  {["FAILED", "UNKNOWN", "BLOCKED"].includes(item.status) && (
                    <>
                      <Button
                        variant="secondary"
                        busy={busy === item.id}
                        onClick={() => retry(item)}
                      >
                        {confirm === item.id
                          ? "Confirmar reenvio"
                          : "Tentar novamente"}
                      </Button>
                      {confirm === item.id && (
                        <p className="muted small">
                          A mensagem pode já ter sido recebida. Confirmar pode
                          gerar duplicidade.{" "}
                          <button
                            type="button"
                            onClick={() => setConfirm(null)}
                          >
                            Cancelar
                          </button>
                        </p>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {resource.data?.total === 0 && (
        <p className="muted">
          Nenhum alerta por e-mail registrado ainda. Os testes do serviço SMTP
          são exibidos na configuração acima.
        </p>
      )}
      <div className="pagination">
        <Button
          variant="secondary"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </Button>
        <span>
          Página {page} de {Math.max(1, resource.data?.pages ?? 1)} ·{" "}
          {resource.data?.total ?? 0} envios
        </span>
        <Button
          variant="secondary"
          disabled={page >= (resource.data?.pages ?? 1)}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </Button>
      </div>
    </section>
  );
}
