import "./env.js";
import nodemailer from "nodemailer";
import {sendCompanyEmail} from './smtp-settings.js';
export const emailConfigured = !!process.env.SMTP_HOST;
const transport = emailConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: process.env.SMTP_SECURE === "true",
      ...(process.env.SMTP_USER
        ? {
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASSWORD ?? "",
            },
          }
        : {}),
      connectionTimeout: 8000,
      socketTimeout: 15000,
    })
  : null;
export async function sendEmail(to: string, subject: string, text: string, organizationId?:string) {
  const result=await sendCompanyEmail('platform',to,subject,text);if(result!==null)return result;
  if (!transport) return false;
  await transport.sendMail({
    from:
      process.env.SMTP_FROM ?? "Licitaro <nao-responda@licita.local>",
    to,
    subject,
    text,
  });
  return true;
}
