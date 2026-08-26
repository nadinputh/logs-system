/**
 * Deliberately no static `import ... from "nodemailer"`, not even a type-only
 * one that a bundler could trace. See `loadNodemailer` below.
 */
type Transporter = { sendMail: (opts: Record<string, unknown>) => Promise<unknown> };

declare global {
  var _mailer: Transporter | undefined;
}

/**
 * Whether SMTP is fully configured. `getTransport()` needs host, user and pass,
 * so the dev fallback must test the same three — keying it on SMTP_HOST alone
 * meant a half-configured environment skipped the safe path and threw at send
 * time, after the caller had already committed its writes.
 */
function smtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
  );
}

/**
 * nodemailer is imported lazily, inside the send path, and deliberately not at
 * module scope.
 *
 * A static top-level import makes the mail dependency a load-time requirement
 * of every route that imports this file — registration, resend-verification,
 * admin user creation and team invites. When the package was missing from
 * node_modules, all four returned 500 before running a single line of their own
 * logic, including request validation. Mail is not load-bearing for account
 * creation; only for the notification that follows it, and callers already
 * treat a send failure as recoverable.
 */
/**
 * Loads nodemailer at runtime, through an indirection the bundler cannot follow.
 *
 * This is deliberate, and it is not a workaround for a broken install. Mail is
 * an *optional* capability of this app: every caller already treats a send
 * failure as recoverable, and the dev path skips sending entirely when SMTP is
 * unconfigured. A statically analysable import — `import "nodemailer"` or even
 * `await import("nodemailer")` — makes the package a hard build-time dependency
 * of the whole compilation. When it was absent from node_modules, that did not
 * merely break mail: it broke every route importing this file *and*, in dev,
 * every page in the app, because one unresolvable module fails the build.
 *
 * With the indirection, a missing or broken mail package surfaces here, at send
 * time, as a catchable error that callers already log and continue past.
 * `serverExternalPackages` in next.config.mjs keeps it unbundled either way.
 */
type NodemailerModule = {
  createTransport: (opts: Record<string, unknown>) => Transporter;
};

async function loadNodemailer(): Promise<NodemailerModule> {
  const load = new Function("m", "return import(m)") as (
    m: string,
  ) => Promise<{ default?: NodemailerModule } & NodemailerModule>;
  try {
    const mod = await load("nodemailer");
    return (mod.default ?? mod) as NodemailerModule;
  } catch (err) {
    throw new Error(
      "SMTP transport unavailable — the 'nodemailer' package is not installed. " +
        `Run your package manager's install. Original error: ${(err as Error)?.message}`,
    );
  }
}

async function getTransport(): Promise<Transporter> {
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

  const nodemailer = await loadNodemailer();

  global._mailer = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user, pass },
    // The send is awaited inside the request that triggered it, so an
    // unresponsive mail server would otherwise hold the connection open until
    // the platform's own timeout and take registration latency with it.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return global._mailer;
}

/**
 * `no-reply@localhost` is rejected outright by most receiving servers, so it is
 * a worse default than no default: it turns a configuration mistake into
 * silently undelivered mail. Absent EMAIL_FROM, fall back to the SMTP user,
 * which is at least an address the relay will accept.
 */
const from = () =>
  process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? "no-reply@localhost";

async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  // With no SMTP configured, log the message instead of throwing so the flows
  // stay testable in development.
  if (!smtpConfigured()) {
    console.log(`[email:dev] To: ${opts.to}\n${opts.subject}\n${opts.text}`);
    return;
  }
  const transport = await getTransport();
  await transport.sendMail({ from: from(), ...opts });
}

/**
 * Values reaching these templates come from the database — a team name and a
 * role chosen by whoever created them — and the result is markup rendered in
 * someone else's mail client. Interpolating them raw let a quote break out of
 * the href attribute and markup through into the body.
 */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shell(
  title: string,
  bodyHtml: string,
  cta: { label: string; href: string },
) {
  const href = encodeURI(cta.href);
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f6f7f9;padding:32px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px">
    <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>
    <p style="color:#475569;line-height:1.5;margin:0 0 24px">${bodyHtml}</p>
    <a href="${escapeHtml(href)}" style="display:inline-block;background:#0e7490;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">${escapeHtml(cta.label)}</a>
    <p style="color:#94a3b8;font-size:12px;margin:24px 0 0">If the button doesn't work, paste this link:<br>${escapeHtml(href)}</p>
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
      `An account was created for you${teamName ? ` on <b>${escapeHtml(teamName)}</b>` : ""}. Set a password to sign in. This link expires in 1 hour.`,
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
      `You've been invited to join <b>${escapeHtml(teamName)}</b> as <b>${escapeHtml(role)}</b>. Accepting will create or link your account.`,
      { label: "Accept invite", href: link },
    ),
  });
}
