import "./env.js";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lookup } from "node:dns/promises";
import nodemailer from "nodemailer";
import { z } from "zod";
import { one, pool } from "./db.js";
import { HttpError } from "./security.js";

export const smtpSettingsSchema = z
  .object({
    enabled: z.boolean(),
    host: z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(253)
      .regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/),
    port: z.number().int().min(1).max(65535),
    mode: z.enum(["starttls", "tls", "local"]),
    username: z.string().trim().max(320),
    password: z.string().max(2048).optional().default(""),
    fromEmail: z.email().max(320),
    fromName: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[^\r\n]*$/),
  })
  .strict();
type Settings = z.infer<typeof smtpSettingsSchema>;
let cachedKey: Buffer | undefined;
function encryptionKey() {
  if (cachedKey) return cachedKey;
  if (process.env.SMTP_ENCRYPTION_KEY) {
    const key = Buffer.from(process.env.SMTP_ENCRYPTION_KEY, "base64");
    if (key.length !== 32) throw new Error("Chave de proteção SMTP inválida.");
    return (cachedKey = key);
  }
  if (process.env.NODE_ENV === "production")
    throw new HttpError(
      503,
      "O operador precisa configurar a chave de proteção SMTP no servidor.",
    );
  const folder = new URL("../../../.local/", import.meta.url),
    path = fileURLToPath(new URL("smtp-key.bin", folder));
  mkdirSync(folder, { recursive: true });
  try {
    writeFileSync(path, randomBytes(32), { flag: "wx", mode: 0o600 });
  } catch (e: any) {
    if (e.code !== "EEXIST") throw e;
  }
  const key = readFileSync(path);
  if (key.length !== 32) throw new Error("Chave de proteção SMTP inválida.");
  return (cachedKey = key);
}
export function encryptSmtpPassword(value: string, orgId: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(orgId));
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((v) => v.toString("base64"))
    .join(".");
}
export function decryptSmtpPassword(value: string, orgId: string) {
  const [iv, tag, encrypted] = value
    .split(".")
    .map((v) => Buffer.from(v, "base64"));
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(orgId));
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(encrypted), cipher.final()]).toString(
    "utf8",
  );
}
export async function emailSettings(orgId: string) {
  orgId = 'platform';
  const row = await one(
    "SELECT settings,password_ciphertext,verified_at FROM platform_email_settings WHERE organization_id=$1",
    [orgId],
  );
  return row
    ? {
        ...row.settings,
        hasPassword: !!row.password_ciphertext,
        verifiedAt: row.verified_at,
        serverConfigured: !!process.env.SMTP_HOST,
      }
    : {
        enabled: false,
        host: "",
        port: 587,
        mode: "starttls",
        username: "",
        fromEmail: "",
        fromName: "Licitaro",
        hasPassword: false,
        verifiedAt: null,
        serverConfigured: !!process.env.SMTP_HOST,
      };
}
export async function saveEmailSettings(orgId: string, input: unknown) {
  orgId = 'platform';
  const b = smtpSettingsSchema.parse(input);
  const old = await one(
    "SELECT settings,password_ciphertext FROM platform_email_settings WHERE organization_id=$1",
    [orgId],
  );
  if (
    b.username &&
    !b.password &&
    old?.password_ciphertext &&
    (old.settings.host !== b.host ||
      old.settings.port !== b.port ||
      old.settings.mode !== b.mode ||
      old.settings.username !== b.username)
  )
    throw new HttpError(
      400,
      "Ao trocar o servidor, conexão ou usuário, informe novamente a senha do serviço.",
    );
  const encrypted = !b.username
    ? null
    : b.password
      ? encryptSmtpPassword(b.password, orgId)
      : (old?.password_ciphertext ?? null);
  if (b.username && !encrypted)
    throw new HttpError(
      400,
      "Informe a senha ou senha de aplicativo do serviço.",
    );
  const { password, ...settings } = b;
  await pool.query(
    "INSERT INTO platform_email_settings(organization_id,settings,password_ciphertext) VALUES($1,$2,$3) ON CONFLICT(organization_id) DO UPDATE SET settings=excluded.settings,password_ciphertext=excluded.password_ciphertext,verified_at=NULL,revision=platform_email_settings.revision+1,updated_at=now()",
    [orgId, JSON.stringify(settings), encrypted],
  );
  return emailSettings(orgId);
}
export async function companyEmailConfigured(orgId: string) {
  orgId = 'platform';
  const row = await one(
    "SELECT settings,verified_at FROM platform_email_settings WHERE organization_id=$1",
    [orgId],
  );
  return row
    ? !!(row.settings.enabled && row.verified_at)
    : !!process.env.SMTP_HOST;
}
export function allowedSmtpAddress(address: string, development: boolean) {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)
  )
    return false;
  const [a, b] = parts;
  if (a === 127) return development;
  return !(
    a === 0 ||
    a === 10 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}
export async function sendCompanyEmail(
  orgId: string,
  to: string,
  subject: string,
  text: string,
  test = false,
  expectedRevision?: number,
): Promise<boolean | null> {
  orgId = 'platform';
  const row = await one(
    "SELECT settings,password_ciphertext,verified_at,revision FROM platform_email_settings WHERE organization_id=$1",
    [orgId],
  );
  if (!row) return null;
  if (expectedRevision !== undefined && row.revision !== expectedRevision)
    throw new HttpError(
      409,
      "A configuração mudou durante o teste. Teste novamente.",
    );
  if (!row.settings.enabled || (!test && !row.verified_at)) return false;
  const s = row.settings as Omit<Settings, "password">;
  const addresses = await lookup(s.host, { family: 4, all: true });
  const development = process.env.NODE_ENV !== "production";
  if (
    !addresses.length ||
    addresses.some((a) => !allowedSmtpAddress(a.address, development))
  )
    throw new Error("Endereço SMTP não permitido.");
  const local =
    addresses.every((a) => a.address.startsWith("127.")) && development;
  if (!local && ![465, 587, 2525].includes(s.port))
    throw new Error("Porta SMTP não permitida.");
  if (s.mode === "local" && !local)
    throw new Error(
      "Conexão sem TLS permitida apenas em localhost no desenvolvimento.",
    );
  const transport = nodemailer.createTransport({
    host: addresses[0].address,
    port: s.port,
    secure: s.mode === "tls",
    requireTLS: s.mode === "starttls",
    ignoreTLS: s.mode === "local",
    tls: { servername: s.host, minVersion: "TLSv1.2" },
    ...(s.username
      ? {
          auth: {
            user: s.username,
            pass: decryptSmtpPassword(row.password_ciphertext, orgId),
          },
        }
      : {}),
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
  });
  try {
    const result = await transport.sendMail({
      from: { name: s.fromName, address: s.fromEmail },
      to,
      subject,
      text,
    });
    if (!result.accepted?.length)
      throw new Error("Destinatário não aceito pelo servidor SMTP.");
    return true;
  } finally {
    transport.close();
  }
}
export async function testEmailSettings(orgId: string, to: string) {
  orgId = 'platform';
  const version = await one(
    "SELECT revision FROM platform_email_settings WHERE organization_id=$1",
    [orgId],
  );
  await pool.query(
    "UPDATE platform_email_settings SET verified_at=NULL WHERE organization_id=$1",
    [orgId],
  );
  try {
    if (
      !(await sendCompanyEmail(
        orgId,
        to,
        "Teste de envio · Licitaro",
        "Este é um teste solicitado na configuração central de e-mail do Licitaro. Se recebeu esta mensagem, o serviço SMTP aceitou o envio.",
        true,
        version?.revision,
      ))
    )
      throw new Error("Serviço desativado.");
  } catch {
    throw new HttpError(
      502,
      "O teste não foi concluído. Confira servidor, porta, segurança, remetente e credenciais. Servidores externos precisam usar TLS e porta 465, 587 ou 2525.",
    );
  }
  const saved = await pool.query(
    "UPDATE platform_email_settings SET verified_at=now() WHERE organization_id=$1 AND revision=$2",
    [orgId, version?.revision],
  );
  if (!saved.rowCount)
    throw new HttpError(
      409,
      "A configuração mudou durante o teste. Teste novamente a versão atual.",
    );
  return {
    message:
      "O servidor SMTP aceitou o e-mail de teste para sua conta. Confira a caixa de entrada e o spam.",
  };
}
