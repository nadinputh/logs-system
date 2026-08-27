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
export function smtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
  );
}

/**
 * Say it once, at load, rather than waiting for a user to report that mail
 * never arrived. Production with no SMTP is a misconfiguration, not a mode:
 * the console fallback deliberately prints nothing there, so without this the
 * first signal an operator gets is a complaint.
 */
if (process.env.NODE_ENV === "production" && !smtpConfigured()) {
  console.error(
    "[email] STARTUP: SMTP is not configured — no verification, set-password " +
      "or invite mail will be sent. Set SMTP_HOST, SMTP_USER and SMTP_PASS.",
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
 * Drops the cached transport so the next send rebuilds it from current env.
 * Without this, correcting a wrong SMTP_PASS appeared not to work: the broken
 * transport survived every hot reload and only a full restart cleared it.
 */
export function resetTransport() {
  global._mailer = undefined;
}

/**
 * `no-reply@localhost` is rejected outright by most receiving servers, so it is
 * a worse default than no default: it turns a configuration mistake into
 * silently undelivered mail. Absent EMAIL_FROM, fall back to the SMTP user,
 * which is at least an address the relay will accept.
 */
const from = () =>
  process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? "no-reply@localhost";

/**
 * Resolves true when the message was actually handed to an SMTP relay, false
 * when it was not sent at all. Callers surface the difference: an admin told
 * "a set-password email was sent" when nothing left the process has no reason
 * to look for the link, and no way to find out.
 */
async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  if (!smtpConfigured()) {
    // `opts.text` carries the plaintext link, and these links are bearer
    // credentials — lib/verification.ts hashes them at rest precisely so no log
    // ever holds a live account-takeover URL. Printing them is a development
    // affordance and must never follow the app into production, where the
    // console is an aggregator someone else can read.
    // Whitelist development explicitly. Testing `!== "production"` printed the
    // link under NODE_ENV=test and — the case that matters — whenever NODE_ENV
    // is unset, which is the default for any process that imports this module
    // outside Next: a seed script, a cron worker, a one-off `node`.
    if (process.env.NODE_ENV === "development") {
      console.log(`[email:dev] To: ${opts.to}\n${opts.subject}\n${opts.text}`);
    } else {
      console.error(
        "[email] SMTP is not configured — mail was NOT sent. " +
          "Set SMTP_HOST, SMTP_USER and SMTP_PASS (all three are required).",
      );
    }
    return false;
  }
  const transport = await getTransport();
  await transport.sendMail({ from: from(), ...opts });
  return true;
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

/**
 * Team names and role labels are user-supplied and may be RTL or mixed-script.
 * `dir="auto"` lets the mail client pick direction per span instead of forcing
 * the paragraph's LTR onto Arabic or Hebrew text.
 */
function autoDir(value: string) {
  return `<span dir="auto">${escapeHtml(value)}</span>`;
}

/**
 * A header line has no escaping of its own, so a newline in a team name would
 * end the Subject and start a new header. Nodemailer sanitises this too; doing
 * it here means the guarantee does not depend on that.
 */
function headerSafe(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** "Thursday 3 September" — a date a recipient can act on, not "soon". */
function formatExpiry(at: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(at);
}

const IGNORE_LINE =
  "If you weren't expecting this, you can ignore this email — nothing happens until you open the link.";

/**
 * Table-based shell with a real <head>.
 *
 * Every element here is load-bearing for a client that is not a browser:
 * - `color-scheme` + an explicit `color` on the heading. Without both, Gmail on
 *   iOS partially inverts — it keeps the card's explicit white background and
 *   remaps inherited text to white, producing a white heading on a white card.
 * - `role="presentation"` so screen readers do not announce layout tables.
 * - The fallback URL is an <a>, not bare text: a recipient whose client blocks
 *   the button is exactly the one who needs it, and bare text is neither
 *   clickable nor in a screen reader's link rota.
 * - `overflow-wrap` because a long unbroken team name otherwise runs out of the
 *   480px card.
 */
function shell(
  title: string,
  bodyHtml: string,
  cta: { label: string; href: string },
  preheader: string,
) {
  const href = encodeURI(cta.href);
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(title)}</title>
<style>
  /* Declaring color-scheme without implementing it is worse than declaring
     nothing: Apple Mail reads the meta above, suppresses its own auto-inversion,
     and leaves a glaring white card in a dark inbox. DESIGN.md calls the dark
     vault first-class, so honour the claim. Inline styles win over stylesheets,
     so these overrides need !important. */
  @media (prefers-color-scheme: dark) {
    .kt-ground { background:#07070f !important; }
    .kt-card   { background:#0f0f1e !important; }
    .kt-title  { color:#f4f4f5 !important; }
    .kt-body   { color:#c7c7d1 !important; }
    .kt-fine   { color:#9d9daa !important; }
    .kt-link   { color:#22d3ee !important; }
    .kt-cta    { background:#0e7490 !important; }
  }
</style>
</head>
<body class="kt-ground" style="margin:0;padding:0;background:#f6f7f9;color:#0f0f1e;font-family:'Inter',system-ui,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${escapeHtml(preheader)}${"&#8204;&nbsp;".repeat(60)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f7f9" class="kt-ground" style="background:#f6f7f9">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%">
<tr><td bgcolor="#ffffff" class="kt-card" style="background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e6e8ec">
<h1 class="kt-title" style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:800;color:#0f0f1e;word-wrap:break-word;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(title)}</h1>
<p class="kt-body" style="margin:0 0 24px;color:#475569;font-size:16px;line-height:1.5;word-wrap:break-word;overflow-wrap:anywhere">${bodyHtml}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="#0e7490" class="kt-cta" style="background:#0e7490;border-radius:10px">
<a href="${escapeHtml(href)}" style="display:inline-block;min-height:48px;line-height:48px;padding:0 24px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600">${escapeHtml(cta.label)}</a>
</td></tr></table>
<p class="kt-fine" style="margin:24px 0 0;color:#57575e;font-size:13px;line-height:1.5">If the button doesn't work, use this link:<br>
<a href="${escapeHtml(href)}" class="kt-link" style="color:#0e7490;word-wrap:break-word;overflow-wrap:anywhere;word-break:break-all">${escapeHtml(href)}</a></p>
<p class="kt-fine" style="margin:16px 0 0;color:#57575e;font-size:13px;line-height:1.5">${escapeHtml(IGNORE_LINE)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

/** What each role actually grants, in words the recipient did not have to look up. */
const ROLE_CLAUSE: Record<string, string> = {
  admin: "an <b>admin</b> — full access to the console, including team and location management",
  manager: "a <b>manager</b> — you can manage locations, quests and logs for the team",
  member: "a <b>member</b> — you can check in and out and see your own logs",
  auditor: "an <b>auditor</b> — read-only access to logs and reports",
};

const roleClause = (role: string) =>
  ROLE_CLAUSE[role] ?? `<b>${escapeHtml(role)}</b>`;

export async function sendVerificationEmail(
  to: string,
  link: string,
): Promise<boolean> {
  return sendMail({
    to,
    subject: "Kamnotheat — verify your email",
    text: `Confirm this address to activate your Kamnotheat account. The link is single-use and expires 1 hour after it was sent: ${link}\n\n${IGNORE_LINE}`,
    html: shell(
      "Verify your email",
      "Confirm this address to activate your Kamnotheat account. The link is single-use and expires 1 hour after it was sent.",
      { label: "Verify email", href: link },
      "Single-use link, expires in 1 hour.",
    ),
  });
}

export async function sendSetPasswordEmail(
  to: string,
  link: string,
  opts: { teamName?: string; invitedByName?: string; expiresAt?: Date } = {},
): Promise<boolean> {
  const { teamName, invitedByName, expiresAt } = opts;
  // Who created the account is the fact a recipient needs to judge whether this
  // is legitimate, and it was being discarded at the call site.
  const actor = invitedByName ? autoDir(invitedByName) : "An administrator";
  const on = teamName ? ` on <b>${autoDir(teamName)}</b>` : "";
  const actorText = invitedByName ?? "An administrator";
  const onText = teamName ? ` on ${teamName}` : "";
  const expiry = expiresAt
    ? ` The link is single-use and expires on ${formatExpiry(expiresAt)}.`
    : " The link is single-use.";
  return sendMail({
    to,
    subject: "Kamnotheat — set your password",
    text: `${actorText} created a Kamnotheat account for you${onText}. Set a password to sign in.${expiry}\n\n${link}\n\n${IGNORE_LINE}`,
    html: shell(
      "Set your password",
      `${actor} created a Kamnotheat account for you${on}. Set a password to sign in.${escapeHtml(expiry)}`,
      { label: "Set password", href: link },
      `${actorText} created this account for you.`,
    ),
  });
}

export async function sendInviteEmail(
  to: string,
  link: string,
  opts: {
    teamName: string;
    role: string;
    invitedByName?: string;
    expiresAt?: Date;
  },
): Promise<boolean> {
  const { teamName, role, invitedByName, expiresAt } = opts;
  const actor = invitedByName ? autoDir(invitedByName) : "Someone";
  const actorText = invitedByName ?? "Someone";
  // "Expires soon" read as hours on a seven-day window. State the day.
  const expiry = expiresAt
    ? ` This invite expires on ${formatExpiry(expiresAt)}.`
    : "";
  return sendMail({
    to,
    subject: headerSafe(`Kamnotheat — you're invited to ${teamName}`),
    text: `${actorText} invited you to join ${teamName} on Kamnotheat as ${role}. Accepting will create or link your account.${expiry}\n\n${link}\n\n${IGNORE_LINE}`,
    html: shell(
      `Join ${teamName}`,
      `${actor} invited you to join <b>${autoDir(teamName)}</b> on Kamnotheat as ${roleClause(role)}. Accepting will create or link your account.${escapeHtml(expiry)}`,
      { label: "Accept invite", href: link },
      `${actorText} invited you to join ${teamName}.`,
    ),
  });
}

export async function sendPasswordResetEmail(
  to: string,
  link: string,
  opts: { expiresAt?: Date } = {},
): Promise<boolean> {
  const { expiresAt } = opts;
  // Password-reset links live an hour; state the exact time when we can.
  const expiry = expiresAt
    ? ` The link is single-use and expires on ${formatExpiry(expiresAt)}.`
    : " The link is single-use and expires in 1 hour.";
  return sendMail({
    to,
    subject: "Kamnotheat — reset your password",
    text: `Someone asked to reset the Kamnotheat password for this address. Open the link below to choose a new one.${expiry}\n\n${link}\n\n${IGNORE_LINE}`,
    html: shell(
      "Reset your password",
      `Someone asked to reset the Kamnotheat password for this address. Open the link below to choose a new one.${escapeHtml(expiry)}`,
      { label: "Reset password", href: link },
      "You asked to reset your password. Single-use link, expires in 1 hour.",
    ),
  });
}
