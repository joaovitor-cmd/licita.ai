// Highlights literal search text, including accents, without interpreting source text as HTML.
export function HighlightedText({
  text,
  terms,
}: {
  text: string;
  terms: string[];
}) {
  const fold = (value: string) =>
    value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const ignored = new Set(["de", "da", "do", "das", "dos"]);
  const words = [
    ...new Set(
      terms
        .map((t) => fold(t.trim()))
        .filter((t) => t.length >= 2 && !ignored.has(t)),
    ),
  ]
    .slice(0, 40)
    .sort((a, b) => b.length - a.length);
  if (!words.length) return <>{text}</>;
  let normalized = "";
  const positions: number[] = [];
  for (let i = 0; i < text.length;) {
    const char = String.fromCodePoint(text.codePointAt(i)!);
    const value = fold(char);
    for (let j = 0; j < value.length; j++) positions.push(i);
    normalized += value;
    i += char.length;
  }
  positions.push(text.length);
  const pattern = new RegExp(
    words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
    "g",
  );
  const parts: { text: string; match: boolean }[] = [];
  let cursor = 0;
  for (const found of normalized.matchAll(pattern)) {
    const start = positions[found.index],
      end = positions[found.index + found[0].length];
    if (start > cursor)
      parts.push({ text: text.slice(cursor, start), match: false });
    parts.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < text.length)
    parts.push({ text: text.slice(cursor), match: false });
  return (
    <>
      {parts.map((part, i) =>
        part.match ? <mark key={i}>{part.text}</mark> : part.text,
      )}
    </>
  );
}
