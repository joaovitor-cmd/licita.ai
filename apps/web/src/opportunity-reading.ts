export function textPreview(value: string, limit = 280) {
  const text = value.replace(/\s+/g, " ").trim(),
    characters = Array.from(text);
  if (characters.length <= limit) return { text, truncated: false };
  const prefix = characters.slice(0, limit).join(""),
    boundary = prefix.lastIndexOf(" ");
  return {
    text:
      (boundary >= prefix.length * 0.6
        ? prefix.slice(0, boundary)
        : prefix
      ).trimEnd() + "…",
    truncated: true,
  };
}
export function proposalDateNotice(
  opensAt: string | null,
  closesAt: string | null,
  now = Date.now(),
): string | null {
  const opening = opensAt ? Date.parse(opensAt) : null,
    closing = closesAt ? Date.parse(closesAt) : null;
  if (
    (opening !== null && !Number.isFinite(opening)) ||
    (closing !== null && !Number.isFinite(closing)) ||
    (opening !== null && closing !== null && opening > closing)
  )
    return "Datas inconsistentes na fonte. Confira o portal oficial.";
  if (closing !== null && closing <= now)
    return "A data limite informada para propostas já passou.";
  if (opening !== null && opening > now)
    return "O início informado para propostas ainda está no futuro.";
  return null;
}
