import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { one, pool } from "./db.js";

export const SESSION_COOKIE = "licita_v2_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1_000;
export const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export const opaqueToken = () => randomBytes(32).toString("base64url");

async function derive(password: string, salt: Buffer, legacy=false): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, { N: legacy?16384:32768, r: 8, p: legacy?1:3, maxmem:64*1024*1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt2$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, encodedKey] = encoded.split("$");
  if (
    !['scrypt','scrypt2'].includes(algorithm) ||
    !salt ||
    !encodedKey ||
    !/^[0-9a-f]{128}$/.test(encodedKey) || !/^[0-9a-f]{32}$/.test(salt)
  )
    return false;
  const key = await derive(password, Buffer.from(salt, "hex"),algorithm==='scrypt');
  return timingSafeEqual(key, Buffer.from(encodedKey, "hex"));
}

export type Auth = {
  user: { id: string; name: string; email: string };
  organization: {
    id: string;
    name: string;
    taxId: string | null;
    isDemo: boolean;
  };
  role: "ADMIN" | "MEMBER";
  isPlatformAdmin: boolean;
  adminRole?: 'OWNER'|'ADMIN'|'VIEWER';
};

declare global {
  namespace Express {
    interface Request {
      auth?: Auth;
    }
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function current(req: Request) {
  if (!req.auth) throw new HttpError(401, "Entre na sua conta para continuar.");
  return req.auth;
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function issueSession(
  res: Response,
  userId: string,
  organizationId: string,
) {
  const token = opaqueToken();
  await pool.query(
    "INSERT INTO sessions(token_hash,user_id,organization_id,expires_at) VALUES($1,$2,$3,$4)",
    [digest(token), userId, organizationId, new Date(Date.now() + SESSION_MS)],
  );
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_MS });
}

export async function clearSession(req: Request, res: Response) {
  const token = req.cookies[SESSION_COOKIE];
  if (typeof token === "string")
    await pool.query("DELETE FROM sessions WHERE token_hash=$1", [
      digest(token),
    ]);
  res.clearCookie(SESSION_COOKIE, cookieOptions);
}

export async function session(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const token = req.cookies[SESSION_COOKIE];
  if (typeof token === "string" && token.length < 200) {
    const row = await one(
      `SELECT u.id, u.name, u.email, o.id org_id, o.name org_name, o.tax_id, o.is_demo, m.role
      FROM sessions s JOIN users u ON u.id=s.user_id JOIN organizations o ON o.id=s.organization_id
      JOIN members m ON m.user_id=u.id AND m.organization_id=o.id
      JOIN organizations e ON e.id=coalesce(o.environment_id,o.id)
      WHERE s.token_hash=$1 AND s.expires_at>now() AND o.active AND e.active AND m.active`,
      [digest(token)],
    );
    if (row) {
      await pool.query("UPDATE members SET last_access_at=now() WHERE user_id=$1 AND organization_id=$2 AND (last_access_at IS NULL OR last_access_at<now()-interval '15 minutes')",[row.id,row.org_id]);
      req.auth = {
        user: { id: row.id, name: row.name, email: row.email },
        organization: {
          id: row.org_id,
          name: row.org_name,
          taxId: row.tax_id,
          isDemo: row.is_demo,
        },
        role: row.role,
        isPlatformAdmin: false,
      };
    }
  }
  next();
}

export function requireSession(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  current(req);
  if(req.get('X-Workspace-Id') && req.get('X-Workspace-Id')!==current(req).organization.id)throw new HttpError(409,'A empresa ativa mudou. Recarregue a página antes de continuar.');
  next();
}
export function requireAdmin(req: Request) {
  if (current(req).role !== "ADMIN")
    throw new HttpError(
      403,
      "Somente administradores da empresa podem realizar esta ação.",
    );
}

const rateBuckets = new Map<string, { count: number; expires: number }>();
export function rateLimit(
  label: string,
  maximum: number,
  windowMs = 15 * 60_000,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    if (rateBuckets.size > 10_000) {
      for (const [key, value] of rateBuckets)
        if (value.expires <= now) rateBuckets.delete(key);
      if (rateBuckets.size > 10_000)
        throw new HttpError(
          429,
          "Muitas tentativas. Tente novamente mais tarde.",
        );
    }
    const key = `${label}:${req.ip}`;
    let bucket = rateBuckets.get(key);
    if (!bucket || bucket.expires <= now) {
      bucket = { count: 0, expires: now + windowMs };
      rateBuckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > maximum) {
      res.setHeader("Retry-After", Math.ceil((bucket.expires - now) / 1000));
      throw new HttpError(
        429,
        "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
      );
    }
    next();
  };
}

export const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...(process.env.WEB_ORIGIN ?? process.env.APP_URL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
]);

export function protectOrigin(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  const ownOrigin = `${req.protocol}://${req.get("host")}`;
  if (origin && origin !== ownOrigin && !allowedOrigins.has(origin))
    throw new HttpError(403, "Origem da solicitação não autorizada.");
  const hasBody = Number(req.get("content-length") ?? 0) > 0 || !!req.get("transfer-encoding");
  if (hasBody && !req.is("application/json") && !req.is("multipart/form-data"))
    throw new HttpError(415, "Envie o conteúdo em JSON.");
  // Multipart is a simple browser request; unlike JSON it needs an explicit Origin.
  if (req.is("multipart/form-data") && !origin)
    throw new HttpError(403, "Origem obrigatória para enviar arquivos.");
  next();
}
