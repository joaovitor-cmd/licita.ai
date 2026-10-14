import { useEffect, useState, type FormEvent } from "react";
import { send, useResource } from "../api";
import type { Member } from "../types";
import { Button, ErrorNotice, Field, Loading, Modal, useToast } from "../ui";

type Settings = {
  defaultOwnerId: string | null;
  defaultOwnerAvailable: boolean;
};

export function RadarSettings({
  members,
  onClose,
}: {
  members: Member[];
  onClose: () => void;
}) {
  const resource = useResource<Settings>("/radar-settings");
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  useEffect(() => {
    if (resource.data) setOwner(resource.data.defaultOwnerId ?? "");
  }, [resource.data]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await send("/radar-settings", "PUT", { defaultOwnerId: owner || null });
      toast(
        "Responsável padrão atualizado. Vale para as próximas oportunidades adicionadas ao radar.",
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Responsável padrão do radar"
      description="As novas oportunidades e suas tarefas iniciais serão atribuídas a esta pessoa. Você pode trocar o responsável de cada participação depois."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="modal-form" onSubmit={save}>
        {resource.loading ? (
          <Loading />
        ) : resource.error ? (
          <ErrorNotice message={resource.error} onRetry={resource.reload} />
        ) : (
          <>
            {error && <ErrorNotice message={error} />}
            <Field label="Responsável por novas oportunidades">
              <select
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                disabled={busy}
              >
                <option value="">Definir manualmente</option>
                {owner && !members.some((m) => m.id === owner) && (
                  <option value={owner} disabled>
                    Usuário indisponível — escolha outro
                  </option>
                )}
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            {resource.data?.defaultOwnerId &&
              !resource.data.defaultOwnerAvailable && (
                <p className="info-note">
                  O responsável anterior não está disponível nesta empresa.
                  Escolha outro para retomar a atribuição automática.
                </p>
              )}
            <p className="muted small">
              As participações existentes mantêm seus responsáveis.
            </p>
            <div className="button-row">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={onClose}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                busy={busy}
                disabled={Boolean(
                  owner && !members.some((m) => m.id === owner),
                )}
              >
                Salvar
              </Button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
