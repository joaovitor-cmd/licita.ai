import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { officialPdfUrl } from "./analysis-rules.js";
export async function downloadPdf(
  value: string,
  signal: AbortSignal,
): Promise<Buffer> {
  const url = officialPdfUrl(value);
  if (!url)
    throw new Error(
      "Origem ainda não suportada para leitura automática. Abra o documento oficial.",
    );
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      "A fonte não forneceu o arquivo diretamente. Confira no portal oficial.",
    );
  }
  if (Number(response.headers.get("content-length")) > 10 * 1024 * 1024) {
    await response.body?.cancel();
    throw new Error("Arquivo acima de 10 MB: leitura manual necessária.");
  }
  const parts: Uint8Array[] = [];
  let size = 0;
  if (!response.body) throw new Error("Arquivo vazio.");
  for await (const part of response.body) {
    size += part.length;
    if (size > 10 * 1024 * 1024)
      throw new Error("Arquivo acima de 10 MB: leitura manual necessária.");
    parts.push(part);
  }
  const buffer = Buffer.concat(parts);
  if (buffer.subarray(0, 5).toString() !== "%PDF-")
    throw new Error("Este anexo não é um PDF legível pelo leitor atual.");
  return buffer;
}
export function readPdf(
  buffer: Buffer,
  signal: AbortSignal,
): Promise<{
  pages: { page: number; text: string }[];
  totalPages: number;
  partial: boolean;
}> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [
        "--max-old-space-size=192",
        fileURLToPath(
          new URL("../../../scripts/pdf-extract.mjs", import.meta.url),
        ),
      ],
      { timeout: 25000, maxBuffer: 6 * 1024 * 1024, windowsHide: true, signal,
        env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:process.env.TEMP,TMP:process.env.TMP,PATH:process.env.PATH}
      },
      (error, stdout) => {
        if (error)
          return reject(
            new Error(
              "PDF protegido, inválido ou acima do tempo de leitura. Confira manualmente.",
            ),
          );
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error("Não foi possível extrair texto deste PDF."));
        }
      },
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(buffer);
  });
}
