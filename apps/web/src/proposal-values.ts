/** Commercial amounts stay decimal strings; no binary floating-point calculations. */
export function decimalInput(value: string): string | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  if (!/^\d{1,13}(?:\.\d{1,4})?$/.test(normalized))
    throw new Error(
      "Use até 13 dígitos e quatro casas decimais, sem separador de milhar.",
    );
  const [whole, fraction = ""] = normalized.split(".");
  const w = String(BigInt(whole)),
    f = fraction.replace(/0+$/, "");
  return w + (f ? "." + f : "");
}
export function decimalDisplay(value: string | null) {
  return value === null ? "" : value.replace(".", ",");
}
export function moneyExact(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return `R$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fraction.padEnd(2, "0")}`;
}
function scaled(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
}
export function commercialTotals(
  items: { id: string; quantity: string | null; unitPrice: string | null }[],
) {
  let cents = 0n,
    complete = true;
  const lines = items.map((item) => {
    if (item.quantity === null || item.unitPrice === null) {
      complete = false;
      return { id: item.id, total: null };
    }
    const line =
      (scaled(item.quantity) * scaled(item.unitPrice) + 500000n) / 1000000n;
    cents += line;
    return {
      id: item.id,
      total: `${line / 100n}.${String(line % 100n).padStart(2, "0")}`,
    };
  });
  return {
    total: `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`,
    complete,
    lines,
  };
}
