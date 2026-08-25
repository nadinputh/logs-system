import nodemailer, { type Transporter } from "nodemailer";

declare global {
  var _mailer: Transporter | undefined;
}

function getTransport(): Transporter {
  if (global._mailer) return global._mailer;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP is not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS",
    );
  }

  global._mailer = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user, pass },
  });
  return global._mailer;
}

const FROM = process.env.EMAIL_FROM ?? "no-reply@localhost";

async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  // In dev with no SMTP, log the message instead of throwing so flows stay testable.
  if (!process.env.SMTP_HOST) {
    console.log(`[email:dev] To: ${opts.to}\n${opts.subject}\n${opts.text}`);
    return;
  }
  await getTransport().sendMail({ from: FROM, ...opts });
}

function shell(title: string, body: string, cta: { label: string; href: string }) {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f6f7f9;padding:32px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px">
    <h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
    <p style="color:#475569;line-height:1.5;margin:0 0 24px">${body}</p>
    <a href="${cta.href}" style="display:inline-block;background:#0e7490;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">${cta.label}</a>
    <p style="color:#94a3b8;font-size:12px;margin:24px 0 0">If the button doesn't work, paste this link:<br>${cta.href}</p>
  </div></body></html>`;
}

export async function sendVerificationEmail(to: string, link: string) {
  await sendMail({
    to,
    subject: "Verify your email — Kamnotheat",
    text: `Verify your email (link expires in 1 hour): ${link}`,
    html: shell(
      "Verify your email",
      "Confirm this address to activate your Kamnotheat account. This link expires in 1 hour.",
      { label: "Verify email", href: link },
    ),
  });
}

export async function sendSetPasswordEmail(
  to: string,
  link: string,
  teamName?: string,
) {
  await sendMail({
    to,
    subject: "Set your password — Kamnotheat",
    text: `Set your password (link expires in 1 hour): ${link}`,
    html: shell(
      "Set your password",
      `An account was created for you${teamName ? ` on <b>${teamName}</b>` : ""}. Set a password to sign in. This link expires in 1 hour.`,
      { label: "Set password", href: link },
    ),
  });
}

export async function sendInviteEmail(
  to: string,
  link: string,
  teamName: string,
  role: string,
) {
  await sendMail({
    to,
    subject: `You're invited to ${teamName} — Kamnotheat`,
    text: `You've been invited to join ${teamName} as ${role}. Accept (link expires soon): ${link}`,
    html: shell(
      `Join ${teamName}`,
      `You've been invited to join <b>${teamName}</b> as <b>${role}</b>. Accepting will create or link your account.`,
      { label: "Accept invite", href: link },
    ),
  });
}
