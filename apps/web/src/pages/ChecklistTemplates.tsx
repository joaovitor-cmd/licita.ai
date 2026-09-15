import { useState } from "react";
import { date, send, useResource } from "../api";
import { Button, ErrorNotice, Field, useToast } from "../ui";
type Item = { kind: "TASK" | "DOCUMENT"; title: string };
type Template = {
  id: string;
  name: string;
  revision: number;
  builtin: boolean;
  items: Item[];
};
type Application = {
  items: Item[];
  id: string;
  template_id: string;
  template_revision: number;
  template_name: string;
  created_tasks: number;
  created_documents: number;
  skipped: number;
  created_at: string;
};
type Editor = {
  id?: string;
  revision?: number;
  name: string;
  tasks: string;
  documents: string;
};
export function ChecklistTemplates({
  opportunityId,
  onApplied,
}: {
  opportunityId: string;
  onApplied: () => void;
}) {
  const library = useResource<Template[]>("/checklist-templates");
  const history = useResource<Application[]>(
    `/opportunities/${opportunityId}/checklist-applications`,
  );
  const [chosen, setChosen] = useState(""),
    [selected, setSelected] = useState<number[]>([]),
    [editor, setEditor] = useState<Editor | null>(null),
    [busy, setBusy] = useState(false),
    [selectedRevision, setSelectedRevision] = useState(0);
  const toast = useToast();
  const model = library.data?.find((t) => t.id === chosen);
  const selectionStale = !!model && model.revision !== selectedRevision;
  const applied = history.data?.find(
    (a) =>
      a.template_id === model?.id && a.template_revision === model?.revision,
  );
  function edit(items: Item[], name: string, existing?: Template) {
    setEditor({
      id: existing?.id,
      revision: existing?.revision,
      name,
      tasks: items
        .filter((i) => i.kind === "TASK")
        .map((i) => i.title)
        .join("\n"),
      documents: items
        .filter((i) => i.kind === "DOCUMENT")
        .map((i) => i.title)
        .join("\n"),
    });
  }
  async function copyCurrent() {
    setBusy(true);
    try {
      const preparation = await send<{
        tasks: { title: string }[];
        documents: { title: string }[];
      }>(`/opportunities/${opportunityId}/preparation`, "GET");
      const items: Item[] = [
        ...preparation.tasks.map((t) => ({
          kind: "TASK" as const,
          title: t.title,
        })),
        ...preparation.documents.map((d) => ({
          kind: "DOCUMENT" as const,
          title: d.title,
        })),
      ];
      if (!items.length) {
        toast(
          "Cadastre tarefas ou exigências antes de salvar a preparação como modelo.",
          true,
        );
        return;
      }
      edit(items, "Preparação da equipe");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!editor) return;
    const items: Item[] = [
      ...editor.tasks
        .split("\n")
        .map((t) => ({ kind: "TASK" as const, title: t.trim() })),
      ...editor.documents
        .split("\n")
        .map((t) => ({ kind: "DOCUMENT" as const, title: t.trim() })),
    ].filter((i) => i.title);
    if (!items.length || items.length > 60) {
      toast("Informe de 1 a 60 itens no total, uma linha por item.", true);
      return;
    }
    setBusy(true);
    try {
      const saved = await send<Template>(
        editor.id
          ? `/checklist-templates/${editor.id}`
          : "/checklist-templates",
        editor.id ? "PUT" : "POST",
        {
          name: editor.name,
          items,
          ...(editor.id ? { revision: editor.revision } : {}),
        },
      );
      library.reload();
      setChosen(saved.id);
      setSelectedRevision(saved.revision);
      setSelected(saved.items.map((_, i) => i));
      setEditor(null);
      toast("Modelo salvo. Checklists já aplicados permanecem independentes.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!model) return;
    setBusy(true);
    try {
      const result = await send<Application & { alreadyApplied: boolean }>(
        `/opportunities/${opportunityId}/checklist-applications`,
        "POST",
        { templateId: model.id, revision: model.revision, selected },
      );
      history.reload();
      onApplied();
      toast(
        result.alreadyApplied
          ? "Esta versão já foi aplicada; nada foi duplicado."
          : `${result.created_tasks} tarefas e ${result.created_documents} exigências adicionadas. ${result.skipped} itens repetidos preservados.`,
      );
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (
      !model ||
      model.builtin ||
      !window.confirm(
        "Arquivar este modelo? Os checklists já aplicados serão preservados.",
      )
    )
      return;
    setBusy(true);
    try {
      await send(`/checklist-templates/${model.id}`, "DELETE", {
        revision: model.revision,
      });
      setChosen("");
      library.reload();
      toast("Modelo arquivado. As cópias aplicadas foram preservadas.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="checklist-templates">
      <summary>Modelos de checklist — reutilize sua preparação</summary>
      <p>
        Use um roteiro como ponto de partida e adapte ao edital. Os modelos
        iniciais sugerem tarefas; documentos obrigatórios só devem ser
        cadastrados após sua conferência.
      </p>
      {library.error && (
        <ErrorNotice message={library.error} onRetry={library.reload} />
      )}
      {history.error && (
        <ErrorNotice message={history.error} onRetry={history.reload} />
      )}
      {library.loading && !library.data && (
        <p role="status">Carregando modelos…</p>
      )}
      <div className="button-row">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => edit([], "")}
        >
          Criar modelo da empresa
        </Button>
        <Button variant="secondary" disabled={busy} onClick={copyCurrent}>
          Salvar preparação atual como modelo
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            library.reload();
            history.reload();
          }}
        >
          Atualizar modelos
        </Button>
      </div>
      <p className="muted small">
        Ao salvar a preparação, apenas os títulos de tarefas e exigências são
        copiados. Arquivos, conferências, observações, responsáveis e prazos não
        são levados ao modelo.
      </p>
      {editor && (
        <form
          className="template-editor"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h3>
            {editor.id ? "Editar modelo da empresa" : "Novo modelo da empresa"}
          </h3>
          <Field label="Nome do modelo">
            <input
              aria-label="Nome do modelo"
              minLength={3}
              maxLength={120}
              required
              value={editor.name}
              disabled={busy}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
            />
          </Field>
          <div className="form-grid">
            <Field label="Tarefas — uma por linha">
              <textarea
                aria-label="Tarefas do modelo"
                rows={6}
                maxLength={14500}
                value={editor.tasks}
                disabled={busy}
                onChange={(e) =>
                  setEditor({ ...editor, tasks: e.target.value })
                }
                placeholder="Conferir prazo de atendimento&#10;Revisar custos da operação"
              />
            </Field>
            <Field label="Exigências documentais — uma por linha">
              <textarea
                aria-label="Exigências documentais do modelo"
                rows={6}
                maxLength={14500}
                value={editor.documents}
                disabled={busy}
                onChange={(e) =>
                  setEditor({ ...editor, documents: e.target.value })
                }
                placeholder="Inclua somente itens que a equipe deverá validar em cada edital."
              />
            </Field>
          </div>
          <p className="muted small">
            Até 60 itens, de 3 a 200 caracteres por linha. Salvar uma edição
            cria uma nova versão do modelo, sem alterar participações
            anteriores.
          </p>
          <div className="button-row">
            <Button type="submit" busy={busy}>
              Salvar modelo
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setEditor(null)}
            >
              Cancelar edição
            </Button>
          </div>
        </form>
      )}
      <Field label="Modelo para esta oportunidade">
        <select
          aria-label="Modelo para esta oportunidade"
          disabled={busy}
          value={chosen}
          onChange={(e) => {
            setChosen(e.target.value);
            const t = library.data?.find((t) => t.id === e.target.value);
            setSelectedRevision(t?.revision ?? 0);
            setSelected(t?.items.map((_, i) => i) ?? []);
          }}
        >
          <option value="">Selecione um modelo para conferir os itens</option>
          {library.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.builtin ? "Sugestão Licitaro" : "Da empresa"} · {t.name} · v
              {t.revision}
            </option>
          ))}
        </select>
      </Field>
      {model && (
        <section aria-label="Prévia do modelo">
          <h3>{model.name}</h3>
          <p>
            Selecione os itens que fazem sentido. Nada será concluído ou
            vinculado a arquivos automaticamente.
          </p>
          <ul className="template-items">
            {model.items.map((item, i) => (
              <li key={`${model.id}-${model.revision}-${i}`}>
                <label>
                  <input
                    type="checkbox"
                    disabled={busy || !!applied || selectionStale}
                    checked={applied ? applied.items.some(previous=>previous.kind===item.kind&&previous.title===item.title) : selected.includes(i)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, i]
                          : selected.filter((n) => n !== i),
                      )
                    }
                  />
                  <span>
                    <strong>
                      {item.kind === "TASK" ? "Tarefa" : "Documento a conferir"}
                      :
                    </strong>{" "}
                    {item.title}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {selectionStale && (
            <p role="alert">
              O modelo mudou. Selecione novamente o modelo na lista antes de
              aplicar.
            </p>
          )}
          <p className="muted small">
            Itens com mesmo tipo e título equivalente já presentes serão
            preservados, inclusive seus estados. As cópias novas começam
            pendentes, sem responsável ou prazo. Tarefas iniciam o radar quando
            necessário.
          </p>
          {applied && (
            <p role="status">
              Esta versão já foi aplicada nesta oportunidade. Ajuste a cópia no
              checklist ou nas tarefas; para um novo conjunto, duplique o
              modelo.
            </p>
          )}
          <div className="button-row">
            <Button
              busy={busy}
              disabled={
                !selected.length ||
                !!applied ||
                selectionStale ||
                !!history.error ||
                history.loading
              }
              onClick={apply}
            >
              Aplicar itens selecionados
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                edit(model.items, `${model.name} — cópia`.slice(0, 120))
              }
            >
              Duplicar e personalizar
            </Button>
            {!model.builtin && (
              <>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => edit(model.items, model.name, model)}
                >
                  Editar modelo
                </Button>
                <Button variant="ghost" disabled={busy} onClick={archive}>
                  Arquivar modelo
                </Button>
              </>
            )}
          </div>
        </section>
      )}
      {!!history.data?.length && (
        <details>
          <summary>Modelos aplicados nesta oportunidade</summary>
          <ul>
            {history.data.map((a) => (
              <li key={a.id}>
                {a.template_name} · v{a.template_revision} ·{" "}
                {date(a.created_at, true)} — {a.created_tasks} tarefas,{" "}
                {a.created_documents} exigências adicionadas; {a.skipped} itens
                repetidos preservados.
              </li>
            ))}
          </ul>
        </details>
      )}
    </details>
  );
}
