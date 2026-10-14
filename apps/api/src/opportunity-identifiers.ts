// Unit identifiers in PNCP are not necessarily UASG codes.
const scalar = (value: unknown): string | null =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim() || null
    : null;

export function opportunityIdentifiers(row: any) {
  const raw = row.identifier_metadata ?? row.raw ?? {};
  const number = scalar(raw.numeroEdital) ?? scalar(raw.numeroCompra);
  const uasg = [
    raw.codigoUasg,
    raw.codigoUASG,
    row.source_code === "comprasgov" ? raw.unidadeOrgaoCodigoUnidade : null,
  ]
    .map(scalar)
    .find((value) => value !== null && /^\d{6}$/.test(value));
  return {
    publicCode:
      row.public_code == null
        ? null
        : `LC-${String(row.public_code).padStart(8, "0")}`,
    editalNumber: number,
    uasg: uasg ?? null,
    capag: null,
  };
}

// Lists need only these identifiers, not the complete external payload.
export const identifierMetadataSql = `jsonb_build_object(
 'numeroEdital',o.raw->'numeroEdital','numeroCompra',o.raw->'numeroCompra',
 'codigoUasg',o.raw->'codigoUasg','codigoUASG',o.raw->'codigoUASG',
 'unidadeOrgaoCodigoUnidade',o.raw->'unidadeOrgaoCodigoUnidade')`;
