import { useRef, useState } from "react";
import { send } from "../api";
import { Button, CheckRow, ErrorNotice, Modal, useToast } from "../ui";
import {
  catalogColumns,
  mappedCatalogRows,
  readCatalogCsv,
  suggestCatalogMapping,
  type CatalogColumn,
} from "../catalog-csv";
import type { Offering } from "../types";
type Preview = {
  rows: {
    row: number;
    item: Omit<Offering, "id" | "updatedAt"> | null;
    issues: string[];
    duplicate: boolean;
    warnings?: string[];
  }[];
  notice: string;
};
const basisLabels: Record<string, string> = {
  PER_UNIT: "Por unidade",
  ONE_TIME: "Único",
  MONTHLY: "Mensal",
  YEARLY: "Anual",
};
const priceFormat = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 4,
});
const price = (value: number | null | undefined) =>
  value == null ? "Não informado" : priceFormat.format(value);
export function CatalogImport({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const fileVersion = useRef(0);
  const [text, setText] = useState(""),
    [fileName, setFileName] = useState(""),
    [separator, setSeparator] = useState(";"),
    [decimal, setDecimal] = useState<"," | ".">(","),
    [table, setTable] = useState<{
      headers: string[];
      rows: string[][];
    } | null>(null),
    [mapping, setMapping] = useState<Record<CatalogColumn, number> | null>(
      null,
    ),
    [preview, setPreview] = useState<Preview | null>(null),
    [selected, setSelected] = useState<number[]>([]),
    [requestId, setRequestId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const toast = useToast();
  function parse(value: string, delimiter: string) {
    try {
      const table = readCatalogCsv(value, delimiter);
      setTable(table);
      setMapping(suggestCatalogMapping(table.headers));
      setError("");
    } catch (e) {
      setTable(null);
      setMapping(null);
      setError((e as Error).message);
    }
    setPreview(null);
    setSelected([]);
    setRequestId("");
  }
  async function load(file?: File) {
    if (!file) return;
    const version = ++fileVersion.current;
    setText("");
    setFileName(file.name);
    setPreview(null);
    setTable(null);
    setMapping(null);
    setError("");
    setSelected([]);
    if (file.size > 1_000_000) {
      setError("Selecione um arquivo CSV de até 1 MB.");
      return;
    }
    setBusy(true);
    try {
      const raw = await file.text();
      if (version !== fileVersion.current) return;
      setText(raw);
      setFileName(file.name);
      parse(raw, separator);
    } catch {
      if (version === fileVersion.current)
        setError("Não foi possível ler o arquivo. Selecione novamente.");
    } finally {
      if (version === fileVersion.current) setBusy(false);
    }
  }
  async function validate() {
    if (!table || !mapping || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await send<Preview>("/catalog/import/preview", "POST", {
        items: mappedCatalogRows(table.rows, mapping, decimal),
      });
      setPreview(result);
      setSelected([]);
      setRequestId(crypto.randomUUID());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!preview || !selected.length || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await send<{ created: number }>(
        "/catalog/import/confirm",
        "POST",
        {
          requestId,
          items: preview.rows
            .filter((r) => selected.includes(r.row))
            .map((r) => r.item),
        },
      );
      toast(
        `${result.created} item(ns) importado(s). Nenhum item existente foi substituído.`,
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function template() {
    const csv =
      "tipo;nome;descricao;unidade;custo interno unitario;preco de venda unitario;periodicidade\r\nServiço;Impressão monocromática;Serviço em papel A4;Página;0,0345;0,0750;Por unidade\r\n";
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-catalogo-licitaro.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const eligible =
    preview?.rows.filter((r) => r.item && !r.duplicate && !r.issues.length) ||
    [];
  return (
    <Modal
      title="Importar catálogo"
      description="Envie um CSV, confira o mapeamento e confirme somente os itens que deseja cadastrar."
      onClose={() => !busy && onClose()}
    >
      <div className="modal-form catalog-import">
        {error && <ErrorNotice message={error} />}
        <p className="info-note">
          Custo interno e preço de venda são campos separados. Nenhum valor é
          copiado para propostas ou simulações automaticamente. Importação não
          substitui itens existentes.
        </p>
        <Button variant="ghost" onClick={template} disabled={busy}>
          Baixar modelo CSV
        </Button>
        <label>
          Arquivo CSV (UTF-8, até 1 MB e 200 itens)
          <input
            aria-label="Arquivo CSV do catálogo"
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => void load(e.target.files?.[0])}
          />
        </label>
        {fileName && <p className="muted small">{fileName}</p>}
        <div className="form-grid">
          <label>
            Separador
            <select
              aria-label="Separador do CSV"
              value={separator}
              disabled={busy}
              onChange={(e) => {
                setSeparator(e.target.value);
                if (text) parse(text, e.target.value);
              }}
            >
              <option value=";">Ponto e vírgula</option>
              <option value=",">Vírgula</option>
              <option value={"\t"}>Tabulação</option>
            </select>
          </label>
          <label>
            Formato dos valores
            <select
              aria-label="Formato dos valores"
              value={decimal}
              disabled={busy}
              onChange={(e) => {
                setDecimal(e.target.value as "," | ".");
                setPreview(null);
              }}
            >
              <option value=",">Brasileiro: 1.234,56</option>
              <option value=".">Decimal com ponto: 1,234.56</option>
            </select>
          </label>
        </div>
        {table && mapping && (
          <>
            <h3>Confirme as colunas</h3>
            <p className="muted small">
              {table.rows.length} itens lidos. Sem coluna de tipo, o padrão é
              Produto. Colunas não mapeadas são ignoradas, nunca interpretadas
              como custo por engano.
            </p>
            <div className="catalog-mapping">
              {(Object.keys(catalogColumns) as CatalogColumn[]).map((key) => (
                <label key={key}>
                  {catalogColumns[key]}
                  <select
                    aria-label={`Coluna: ${catalogColumns[key]}`}
                    value={mapping[key]}
                    disabled={busy}
                    onChange={(e) => {
                      setMapping({ ...mapping, [key]: Number(e.target.value) });
                      setPreview(null);
                    }}
                  >
                    <option value={-1}>Não importar este campo</option>
                    {table.headers.map((name, index) => (
                      <option key={index} value={index}>
                        {index + 1}. {name || "Coluna sem título"}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <Button
              variant="secondary"
              busy={busy}
              onClick={validate}
              disabled={mapping.name < 0}
            >
              Conferir prévia
            </Button>
          </>
        )}
        {preview && (
          <>
            <h3>Prévia — nada gravado ainda</h3>
            <p className="muted">{preview.notice}</p>
            <div className="button-row">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setSelected(eligible.map((r) => r.row));
                  setRequestId(crypto.randomUUID());
                }}
              >
                Selecionar {eligible.length} itens válidos
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setSelected([]);
                  setRequestId(crypto.randomUUID());
                }}
              >
                Desmarcar todos
              </Button>
            </div>
            <div className="catalog-preview">
              {preview.rows.map((row) => (
                <article key={row.row} className="catalog-preview-row">
                  <CheckRow
                    disabled={
                      busy || !row.item || row.duplicate || !!row.issues.length
                    }
                    checked={selected.includes(row.row)}
                    onChange={(checked) => {
                      setSelected(
                        checked
                          ? [...selected, row.row]
                          : selected.filter((i) => i !== row.row),
                      );
                      setRequestId(crypto.randomUUID());
                    }}
                  >
                    Linha {row.row}: {row.item?.name || "Item inválido"}
                  </CheckRow>
                  {row.duplicate && (
                    <p>
                      Já existe ou está repetido no arquivo. Não será
                      substituído.
                    </p>
                  )}
                  {row.issues.map((issue) => (
                    <p key={issue} role="status">
                      {issue}
                    </p>
                  ))}
                  {row.warnings?.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                  {row.item && (
                    <dl className="detail-fields">
                      <div>
                        <dt>Tipo / unidade / periodicidade</dt>
                        <dd>
                          {row.item.type === "SERVICE" ? "Serviço" : "Produto"}{" "}
                          · {row.item.unit || "Não informada"} ·{" "}
                          {basisLabels[row.item.priceBasis || ""] ||
                            "Não informada"}
                        </dd>
                      </div>
                      <div>
                        <dt>Custo interno unitário</dt>
                        <dd>{price(row.item.unitCost)}</dd>
                      </div>
                      <div>
                        <dt>Preço de venda unitário</dt>
                        <dd>{price(row.item.salePrice)}</dd>
                      </div>
                    </dl>
                  )}
                </article>
              ))}
            </div>
            <p>
              {selected.length} itens selecionados. Todos serão cadastrados
              juntos após sua confirmação.
            </p>
            <Button busy={busy} disabled={!selected.length} onClick={confirm}>
              Confirmar importação de {selected.length} itens
            </Button>
          </>
        )}
        <div className="modal-footer">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
