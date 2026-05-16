import nodemailer from "nodemailer";
import { prisma } from "./prisma.js";

const BASE_HTML = (body: string) => `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a2e">
  <img src="https://boiaro.com/logo.png" alt="BoiAro" style="height:32px;margin-bottom:16px" onerror="this.style.display='none'">
  ${body}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="font-size:11px;color:#9ca3af">You received this email from BoiAro. If you have questions, contact our support team.</p>
</div>
`;

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
}

async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const settings = await prisma.platformSetting.findMany({
    where: {
      key: {
        in: ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from_email", "smtp_from_name", "smtp_secure"],
      },
    },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  if (!map.smtp_host || !map.smtp_user || !map.smtp_pass) return null;
  return {
    host: map.smtp_host,
    port: parseInt(map.smtp_port || "587", 10),
    secure: map.smtp_secure === "true",
    user: map.smtp_user,
    pass: map.smtp_pass,
    fromEmail: map.smtp_from_email || map.smtp_user,
    fromName: map.smtp_from_name || "BoiAro",
  };
}

function createTransport(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const config = await getSmtpConfig();
    if (!config) {
      return { success: false, error: "SMTP not configured. Go to Admin → Email Settings to set up SMTP." };
    }
    const transporter = createTransport(config);
    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Send an email and log the attempt to the email_logs table.
 * Never throws — failures are returned and logged gracefully.
 */
export async function sendNotificationEmail(opts: {
  to: string;
  subject: string;
  bodyHtml: string;
  templateType: string;
  text?: string;
}): Promise<{ success: boolean; error?: string }> {
  const html = BASE_HTML(opts.bodyHtml);
  const result = await sendMail({ to: opts.to, subject: opts.subject, html, text: opts.text });
  prisma.emailLog.create({
    data: {
      recipient_email: opts.to,
      template_type: opts.templateType,
      subject: opts.subject,
      status: result.success ? "sent" : "failed",
      error_message: result.error ?? null,
      sent_at: result.success ? new Date() : null,
    },
  }).catch(() => {});
  return result;
}

export async function testSmtpConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    const config = await getSmtpConfig();
    if (!config) return { success: false, error: "SMTP not configured" };
    const transporter = createTransport(config);
    await transporter.verify();
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
