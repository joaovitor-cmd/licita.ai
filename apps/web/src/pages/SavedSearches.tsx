import { useState, type FormEvent } from "react";
import { BookmarkCheck, Plus } from "lucide-react";
import { send, useResource } from "../api";
import { Button, ErrorNotice, Field, Modal, useSession, useToast } from "../ui";
import { STATES } from "../types";

type Profile = {
  id: string;
  name: string;
  description: string;
  filters: Record<string, string | number>;
  revision: number;
  active: boolean;
};
const keys = [
  "q",
  "terms",
  "exclude",
  "state",
  "states",
  "city",
  "agency",
  "modality",
  "modalities",
  "source",
  "sources",
  "status",
  "minValue",
  "maxValue",
  "minScore",
  "from",
  "to",
  "sort",
];
const fromParams = (params: URLSearchParams) =>
  Object.fromEntries(
    keys.filter((k) => params.has(k)).map((k) => [k, params.get(k)!]),
  );
const comparable = (f: Record<string, string | number>) =>
  JSON.stringify(
    keys
      .filter(
        (k) =>
          f[k] !== undefined &&
          f[k] !== "" &&
          !(k === "sort" && f[k] === "score"),
      )
      .map((k) => [k, String(f[k])]),
  );
export function SavedSearches({
  params,
  onApply,
}: {
  params: URLSearchParams;
  onApply: (next: URLSearchParams) => void;
}) {
  const { session } = useSession(),
    toast = useToast(),
    profiles = useResource<Profile[]>("/search-profiles");
  const [editor, setEditor] = useState<{
    id?: string;
    revision?: number;
    name: string;
    description: string;
    filters: Record<string, string | number>;
  } | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [jointSelection,setJointSelection]=useState<string[]>([]);
  const jointIds=[...new Set((params.get('searchProfiles')||'').split(',').map(id=>id.trim().toLowerCase()).filter(Boolean))];
  function openManager(){setJointSelection(jointIds);setError('');setManagerOpen(true);}
  function applyJoint(){
    const active=profiles.data?.filter(p=>p.active!==false).map(p=>p.id)||[];
    if(!jointSelection.length||jointSelection.length>10||jointSelection.some(id=>!active.includes(id))){setError('Selecione de 1 a 10 perfis disponíveis.');return;}
    const next=new URLSearchParams({searchProfiles:jointSelection.join(','),sort:params.get('sort')||'score'});
    if(params.has('pageSize'))next.set('pageSize',params.get('pageSize')!);
    onApply(next);setManagerOpen(false);
  }
  const [remove, setRemove] = useState<Profile | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const admin = session.role === "ADMIN";
  const selected = profiles.data?.find(
    (p) => p.id === params.get("searchProfile"),
  );
  const modified =
    selected && comparable(selected.filters) !== comparable(fromParams(params));
  function apply(p?: Profile) {
    const next = new URLSearchParams();
    if (p) {
      next.set("searchProfile", p.id);
      for (const [k, v] of Object.entries(p.filters))
        if (keys.includes(k) && v !== "") next.set(k, String(v));
    }
    onApply(next);
  }
  function open(p?: Profile) {
    setError("");
    setManagerOpen(false);
    setEditor(
      p
        ? { ...p, filters: { ...p.filters } }
        : { name: "", description: "", filters: jointIds.length?{}:fromParams(params) },
    );
  }
  function duplicate(p: Profile) {
    setError("");
    setManagerOpen(false);
    setEditor({
      name: p.name.slice(0, 72) + " (cópia)",
      description: p.description,
      filters: { ...p.filters },
    });
  }
  async function toggle(p: Profile) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const updated = await send<Profile>(
        `/search-profiles/${p.id}/active`,
        "PATCH",
        { active: p.active === false, revision: p.revision },
      );
      profiles.setData(
        (old) =>
          old?.map((item) => (item.id === p.id ? updated : item)) ?? null,
      );
      if (!updated.active && selected?.id === p.id) {
        const next = new URLSearchParams(params);
        next.delete("searchProfile");
        onApply(next);
      }
      toast(
        updated.active
          ? "Perfil retomado."
          : "Perfil pausado. Os filtros desta busca e o radar foram preservados.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function field(k: string, value: string) {
    setEditor((old) => {
      if (!old) return old;
      const filters = { ...old.filters };
      if (value) filters[k] = value;
      else delete filters[k];
      if (k === "states") delete filters.state;
      if (k === "modalities") delete filters.modality;
      if (k === "sources") delete filters.source;
      return { ...old, filters };
    });
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editor || busy) return;
    setBusy(true);
    setError("");
    try {
      const p = await send<Profile>(
        editor.id ? "/search-profiles/" + editor.id : "/search-profiles",
        editor.id ? "PUT" : "POST",
        {
          name: editor.name,
          description: editor.description,
          filters: editor.filters,
          ...(editor.id ? { revision: editor.revision } : {}),
        },
      );
      profiles.reload();
      if (p.active !== false) apply(p);
      setEditor(null);
      setManagerOpen(false);
      toast(
        p.active === false
          ? "Perfil salvo. Continua pausado."
          : "Perfil de busca salvo e aplicado.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteProfile() {
    if (!remove || busy) return;
    setBusy(true);
    setError("");
    try {
      await send("/search-profiles/" + remove.id, "DELETE", {
        revision: remove.revision,
      });
      if (selected?.id === remove.id) {
        const next = new URLSearchParams(params);
        next.delete("searchProfile");
        onApply(next);
      }
      profiles.reload();
      setRemove(null);
      toast("Perfil excluído. Os editais e o radar foram preservados.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const v = (key: string) => String(editor?.filters[key] ?? "");
  const states = (v("states") || v("state")).split(",").filter(Boolean);
  return (
    <section className="saved-searches" aria-label="Perfis de busca">
      <Button variant="secondary" onClick={openManager}>
        <BookmarkCheck size={16} />
        {jointIds.length?`${jointIds.length} perfis em busca`:selected ? selected.name : "Perfis de busca"}
      </Button>
      {managerOpen && !editor && !remove && (
        <Modal
          title="Perfis de busca"
          description="Guarde filtros para diferentes focos de procura. Isso não altera o perfil comercial da empresa nem limita as oportunidades disponíveis."
          onClose={() => setManagerOpen(false)}
        >
          <div className="modal-form saved-search-manager">
            <div className="saved-searches-row">
              {admin && (
                <Button type="button" onClick={() => open()}>
                  <Plus size={15} /> Criar perfil de busca
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  apply();
                  setManagerOpen(false);
                }}
              >
                Busca livre
              </Button>
            </div>
            {error && <ErrorNotice message={error} />}
            {profiles.error && (
              <ErrorNotice
                message="Não foi possível carregar os perfis salvos. A busca livre continua disponível."
                onRetry={profiles.reload}
              />
            )}
            {profiles.loading && (
              <p role="status" className="muted small">
                Carregando perfis…
              </p>
            )}
            {profiles.data?.length === 0 && (
              <p className="muted small">
                Crie seu primeiro perfil com nome, termos e região. Os filtros
                atuais entram como ponto de partida e podem ser ajustados antes
                de salvar.
              </p>
            )}
            <div className="saved-profile-list">
              {profiles.data?.map((p) => (
                <article
                  className="saved-profile-row"
                  key={p.id}
                  aria-label={`Perfil ${p.name}`}
                >
                  <div>
                    <label className="small"><input type="checkbox" aria-label={`Combinar perfil ${p.name}`} checked={jointSelection.includes(p.id)} disabled={busy||(!jointSelection.includes(p.id)&&(p.active===false||jointSelection.length>=10))} onChange={e=>setJointSelection(old=>e.target.checked?[...old,p.id]:old.filter(id=>id!==p.id))}/> Combinar na busca</label>
                    <strong>{p.name}</strong>
                    <span className="muted small">
                      {p.active === false
                        ? "Pausado"
                        : selected?.id === p.id
                          ? "Em uso"
                          : "Disponível"}
                      {p.description && ` · ${p.description}`}
                    </span>
                  </div>
                  <div className="saved-profile-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy || p.active === false}
                      onClick={() => {
                        apply(p);
                        setManagerOpen(false);
                      }}
                    >
                      Aplicar
                    </Button>
                    {admin && (
                      <details>
                        <summary>Mais ações</summary>
                        <div className="button-row">
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => open(p)}
                          >
                            Editar perfil
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => duplicate(p)}
                          >
                            Duplicar perfil
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void toggle(p)}
                          >
                            {p.active === false
                              ? "Retomar perfil"
                              : "Pausar perfil"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                              setError("");
                              setManagerOpen(false);
                              setRemove(p);
                            }}
                          >
                            Excluir perfil
                          </Button>
                        </div>
                      </details>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {(!!profiles.data?.length||!!jointSelection.length)&&<div className="saved-search-more"><p className="muted small">Combine até 10 perfis: um edital pode corresponder a qualquer um deles e aparece apenas uma vez. Esta ação substitui os filtros atuais; depois você pode refinar a busca. Os perfis salvos não são alterados.</p>{profiles.data&&jointSelection.some(id=>!profiles.data!.some(p=>p.id===id&&p.active!==false))&&<p className="small">Há perfil pausado ou indisponível na seleção. Desmarque-o ou limpe a seleção para escolher novamente.</p>}<div className="button-row"><Button type="button" disabled={busy||profiles.loading||!jointSelection.length} onClick={applyJoint}>Buscar com selecionados ({jointSelection.length})</Button><Button type="button" variant="ghost" disabled={busy||!jointSelection.length} onClick={()=>setJointSelection([])}>Limpar seleção</Button></div></div>}
            {selected && (
              <p className="muted small">
                {selected.description && <>{selected.description} · </>}
                {modified
                  ? "Filtros alterados nesta busca; o perfil salvo não foi modificado."
                  : "Perfil aplicado. Você pode ajustar os filtros ou voltar à busca livre."}
              </p>
            )}
            {(params.get("terms") ||
              params.get("exclude") ||
              params.get("states")) && (
              <p className="small">
                {params.get("terms") && (
                  <>Interesses: {params.get("terms")}. </>
                )}
                {params.get("exclude") && (
                  <>Excluindo: {params.get("exclude")}. </>
                )}
                {params.get("states") && <>Estados: {params.get("states")}.</>}
              </p>
            )}
          </div>
        </Modal>
      )}
      {editor && (
        <Modal
          title={
            editor.id ? "Editar perfil de busca" : "Salvar perfil de busca"
          }
          description="Compartilhado com sua empresa. Não altera o cadastro comercial nem as recomendações do painel."
          onClose={() => {
            if (!busy) setEditor(null);
          }}
        >
          <form className="modal-form saved-search-form" onSubmit={save}>
            {jointIds.length&&!editor.id&&<p className="muted small">Novo perfil independente. A combinação de perfis não é copiada; configure abaixo um novo foco de busca.</p>}
            {error && <ErrorNotice message={error} />}
            <Field label="Nome do perfil" required>
              <input
                required
                maxLength={80}
                value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                placeholder="Ex.: Impressão — região Sul"
              />
            </Field>
            <Field label="Descrição">
              <input
                maxLength={300}
                value={editor.description}
                onChange={(e) =>
                  setEditor({ ...editor, description: e.target.value })
                }
              />
            </Field>
            <Field
              label="Termos de interesse"
              hint="Separe por vírgula. Qualquer termo pode corresponder; todas as palavras de cada termo precisam estar presentes."
            >
              <input
                maxLength={2000}
                value={v("terms")}
                onChange={(e) => field("terms", e.target.value)}
                placeholder="impressora, outsourcing de impressão"
              />
            </Field>
            <Field
              label="Excluir termos"
              hint="Oculta resultados que contenham esses termos nesta busca. Até 20 termos separados por vírgula."
            >
              <input
                maxLength={2000}
                value={v("exclude")}
                onChange={(e) => field("exclude", e.target.value)}
                placeholder="cartucho remanufaturado"
              />
            </Field>
            <fieldset className="search-states">
              <legend>Área de busca — estados</legend>
              <p className="muted small">
                Sem seleção: todo o Brasil. Usa a localização informada na
                oportunidade, não garante cobertura de entrega.
              </p>
              <div>
                {STATES.map((s) => (
                  <label key={s}>
                    <input
                      type="checkbox"
                      checked={states.includes(s)}
                      onChange={(e) =>
                        field(
                          "states",
                          (e.target.checked
                            ? [...states, s]
                            : states.filter((x) => x !== s)
                          ).join(","),
                        )
                      }
                    />
                    {s}
                  </label>
                ))}
              </div>
            </fieldset>
            <details className="saved-search-more">
              <summary>Município, modalidade, fonte e outros filtros</summary>
              <div className="saved-search-grid">
                <Field label="Município">
                  <input
                    maxLength={150}
                    value={v("city")}
                    onChange={(e) => field("city", e.target.value)}
                  />
                </Field>
                <Field label="Órgão">
                  <input
                    maxLength={200}
                    value={v("agency")}
                    onChange={(e) => field("agency", e.target.value)}
                  />
                </Field>
                <Field
                  label="Busca complementar"
                  hint="Todas as palavras deste campo serão exigidas."
                >
                  <input
                    maxLength={300}
                    value={v("q")}
                    onChange={(e) => field("q", e.target.value)}
                  />
                </Field>
                <fieldset className="search-options">
                  <legend>Modalidades</legend>
                  <p className="muted small">Sem seleção: todas.</p>
                  {[
                    "Pregão eletrônico",
                    "Concorrência",
                    "Dispensa",
                    "Credenciamento",
                    "Concurso",
                    "Leilão",
                  ].map((s) => {
                    const selected = (v("modalities") || v("modality"))
                      .split(",")
                      .filter(Boolean);
                    return (
                      <label key={s}>
                        <input
                          type="checkbox"
                          checked={selected.includes(s)}
                          onChange={(e) =>
                            field(
                              "modalities",
                              (e.target.checked
                                ? [...selected, s]
                                : selected.filter((x) => x !== s)
                              ).join(","),
                            )
                          }
                        />
                        {s}
                      </label>
                    );
                  })}
                </fieldset>
                <fieldset className="search-options">
                  <legend>Portais de origem</legend>
                  <p className="muted small">
                    Sem seleção: todos os portais disponíveis.
                  </p>
                  {[
                    ["pncp", "PNCP"],
                    ["comprasgov", "Compras.gov.br"],
                  ].map(([id, label]) => {
                    const selected = (v("sources") || v("source"))
                      .split(",")
                      .filter(Boolean);
                    return (
                      <label key={id}>
                        <input
                          type="checkbox"
                          checked={selected.includes(id)}
                          onChange={(e) =>
                            field(
                              "sources",
                              (e.target.checked
                                ? [...selected, id]
                                : selected.filter((x) => x !== id)
                              ).join(","),
                            )
                          }
                        />
                        {label}
                      </label>
                    );
                  })}
                </fieldset>
                <Field label="Situação">
                  <select
                    value={v("status")}
                    onChange={(e) => field("status", e.target.value)}
                  >
                    <option value="">Todas</option>
                    <option value="open">Recebendo propostas</option>
                    <option value="closed">Prazo encerrado</option>
                  </select>
                </Field>
                {(["minValue", "maxValue", "minScore"] as const).map((k, i) => (
                  <Field
                    key={k}
                    label={
                      [
                        "Valor mínimo (R$)",
                        "Valor máximo (R$)",
                        "Aderência mínima (%)",
                      ][i]
                    }
                  >
                    <input
                      type="number"
                      min="0"
                      max={k === "minScore" ? 100 : undefined}
                      step={k === "minScore" ? 1 : 0.01}
                      value={v(k)}
                      onChange={(e) => field(k, e.target.value)}
                    />
                  </Field>
                ))}
                <Field label="Publicado a partir de">
                  <input
                    type="date"
                    value={v("from")}
                    onChange={(e) => field("from", e.target.value)}
                  />
                </Field>
                <Field label="Publicado até">
                  <input
                    type="date"
                    value={v("to")}
                    onChange={(e) => field("to", e.target.value)}
                  />
                </Field>
                <Field label="Ordenação">
                  <select
                    value={v("sort") || "score"}
                    onChange={(e) => field("sort", e.target.value)}
                  >
                    <option value="score">Aderência</option>
                    <option value="newest">Mais recentes</option>
                    <option value="deadline">Prazo</option>
                    <option value="value">Maior valor</option>
                  </select>
                </Field>
              </div>
            </details>
            <div className="button-row">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" busy={busy}>
                Salvar e aplicar
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {remove && (
        <Modal
          title="Excluir perfil de busca?"
          onClose={() => {
            if (!busy) setRemove(null);
          }}
        >
          <div className="modal-form">
            <p>
              Excluir “{remove.name}”? Essa ação remove apenas os filtros
              salvos. Não exclui oportunidades nem acompanhamentos.
            </p>
            {error && <ErrorNotice message={error} />}
            <div className="button-row">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setRemove(null)}
              >
                Cancelar
              </Button>
              <Button variant="danger" busy={busy} onClick={deleteProfile}>
                Confirmar exclusão
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
