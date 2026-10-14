export type ItemSearchProfile = {
  id: string;
  name: string;
  active: boolean;
  filters: Record<string, string | number>;
};
export const foldItemText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export const itemWords = (text: string) =>
  foldItemText(text)
    .split(" ")
    .filter((word) => word && !["de", "da", "do", "das", "dos"].includes(word));
export function itemProfileTerms(value: unknown) {
  return String(value || "")
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);
}
/** Compile profile terms once per profile, not once per row or keystroke. */
export function createItemInterestMatcher(
  terms: string[],
  exclusions: string[],
) {
  const include = terms.map((term) => ({ term, words: itemWords(term) })),
    exclude = exclusions.map(itemWords);
  return (description: string) => {
    const tokens = new Set(itemWords(description));
    const matches = (required: string[]) =>
      required.length > 0 && required.every((word) => tokens.has(word));
    const matched = include
        .filter((term) => matches(term.words))
        .map((term) => term.term),
      excluded = exclude.some(matches);
    return { matched, excluded, interested: matched.length > 0 && !excluded };
  };
}
