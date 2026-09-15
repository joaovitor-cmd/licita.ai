import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { one, pool, transaction } from "./db.js";
import {
  clearSession,
  current,
  digest,
  hashPassword,
  HttpError,
  issueSession,
  opaqueToken,
  rateLimit,
  verifyPassword,
} from "./security.js";
import { email, loginSchema, password, registerSchema } from "./validation.js";
import { sendEmail } from "./mailer.js";
import { createDemo } from "./demo.js";

export const authRouter = Router();
authRouter.get("/me", (req, res) => res.json(current(req)));
authRouter.post("/register", rateLimit("register", 10), async (req, res) => {
  const body = registerSchema.parse(req.body);
  const userId = randomUUID(),
    orgId = randomUUID();
  const passwordHash = await hashPassword(body.password);
  await transaction(async (db) => {
    if (await one("SELECT id FROM users WHERE email=$1", [body.email], db))
      throw new HttpError(
        409,
        "Este e-mail já está cadastrado. Entre na conta ou recupere sua senha.",
      );
    await db.query("INSERT INTO organizations(id,name) VALUES($1,$2)", [
      orgId,
      body.organizationName,
    ]);
    await db.query(
      "INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)",
      [userId, body.name, body.email, passwordHash],
    );
    await db.query(
      "INSERT INTO members(organization_id,user_id,role) VALUES($1,$2,'ADMIN')",
      [orgId, userId],
    );
  });
  await clearSession(req, res);
  await issueSession(res, userId, orgId);
  res
    .status(201)
    .json({
      user: { id: userId, name: body.name, email: body.email },
      organization: {
        id: orgId,
        name: body.organizationName,
        taxId: null,
        isDemo: false,
      },
      role: "ADMIN",
      isPlatformAdmin: false,
    });
});
// Perform the same password derivation even when the account does not exist.
const dummyPasswordHash = hashPassword(opaqueToken());
authRouter.post("/login", rateLimit("login", 20), async (req, res) => {
  const body = loginSchema.parse(req.body);
  const user = await one(
    `SELECT u.*, m.organization_id, m.role, o.name org_name, o.tax_id, o.is_demo FROM users u
    JOIN members m ON m.user_id=u.id JOIN organizations o ON o.id=m.organization_id JOIN organizations e ON e.id=coalesce(o.environment_id,o.id) WHERE u.email=$1 AND o.is_demo=false AND o.active AND e.active AND m.active ORDER BY o.created_at LIMIT 1`,
    [body.email],
  );
  const valid = await verifyPassword(
    body.password,
    user?.password_hash ?? (await dummyPasswordHash),
  );
  if (!user || !valid) throw new HttpError(401, "E-mail ou senha incorretos.");
  await clearSession(req, res);
  await issueSession(res, user.id, user.organization_id);
  res.json({
    user: { id: user.id, name: user.name, email: user.email },
    organization: {
      id: user.organization_id,
      name: user.org_name,
      taxId: user.tax_id,
      isDemo: false,
    },
    role: user.role,
    isPlatformAdmin: false,
  });
});
authRouter.post("/logout", async (req, res) => {
  await clearSession(req, res);
  res.json({ ok: true });
});
authRouter.post("/demo", rateLimit("demo", 12), async (req, res) => {
  const { orgId, userId } = await transaction(createDemo);
  await clearSession(req, res);
  await issueSession(res, userId, orgId);
  const org = await one("SELECT name FROM organizations WHERE id=$1", [orgId]);
  const user = await one("SELECT id,name,email FROM users WHERE id=$1", [
    userId,
  ]);
  res
    .status(201)
    .json({
      user,
      organization: { id: orgId, name: org.name, taxId: null, isDemo: true },
      role: "ADMIN",
      isPlatformAdmin: false,
    });
});
authRouter.post(
  "/forgot-password",
  rateLimit("forgot", 8),
  async (req, res) => {
    const body = z.object({ email }).strict().parse(req.body);
    const user = await one(
      `SELECT u.id,u.email FROM users u JOIN members m ON m.user_id=u.id JOIN organizations o ON o.id=m.organization_id WHERE u.email=$1 AND o.is_demo=false LIMIT 1`,
      [body.email],
    );
    if (user) {
      const token = opaqueToken();
      await transaction(async (db) => {
        await db.query("DELETE FROM reset_tokens WHERE user_id=$1", [user.id]);
        await db.query(
          "INSERT INTO reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",
          [digest(token), user.id],
        );
      });
      const link = `${process.env.APP_URL ?? "http://localhost:5173"}/redefinir-senha?token=${encodeURIComponent(token)}`;
      // Always respond uniformly; delivery errors do not disclose account existence.
      void sendEmail(
        user.email,
        "Redefinição de senha · Licitaro",
        `Você solicitou uma nova senha. Abra o link em até 30 minutos:\n\n${link}\n\nSe não foi você, ignore esta mensagem.`,
      ).catch(() =>
        console.warn(
          "Falha ao enviar e-mail de recuperação. Verifique a configuração SMTP.",
        ),
      );
    }
    res.json({
      message:
        "Se o e-mail estiver cadastrado e o envio estiver configurado, você receberá as instruções para redefinir a senha.",
    });
  },
);
authRouter.post("/reset-password", rateLimit("reset", 12), async (req, res) => {
  const body = z
    .object({ token: z.string().min(32).max(200), password })
    .strict()
    .parse(req.body);
  const passwordHash = await hashPassword(body.password);
  await transaction(async (db) => {
    const token = await one(
      "SELECT * FROM reset_tokens WHERE token_hash=$1 AND expires_at>now() FOR UPDATE",
      [digest(body.token)],
      db,
    );
    if (!token)
      throw new HttpError(
        400,
        "Link inválido ou expirado. Solicite uma nova redefinição.",
      );
    await db.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
      passwordHash,
      token.user_id,
    ]);
    await db.query("DELETE FROM reset_tokens WHERE user_id=$1", [
      token.user_id,
    ]);
    await db.query("DELETE FROM sessions WHERE user_id=$1", [token.user_id]);
  });
  res.clearCookie("licita_v2_session", { path: "/" });
  res.json({ message: "Senha atualizada. Entre novamente com a nova senha." });
});
