// Multipart filenames can contain UTF-8 bytes decoded as Latin-1 by the parser.
// Repair only when the complete byte sequence is valid UTF-8; preserve real Unicode.
export function normalizeDocumentFilename(name: string): string {
  let value = name;
  for (let pass = 0; pass < 2; pass++) {
    if (!/[ÃÂâð]/.test(value) || [...value].some(char => char.codePointAt(0)! > 255)) break;
    try {
      const decoded = new TextDecoder('utf-8', {fatal: true}).decode(Buffer.from(value, 'latin1'));
      if (decoded === value || decoded.includes('\uFFFD')) break;
      value = decoded;
    } catch { break; }
  }
  return value.replace(/[\r\n\\/]/g, '_');
}
