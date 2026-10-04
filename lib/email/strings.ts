/**
 * Email copy per language. Deliberately not next-intl: these are sent from API
 * routes and tests with no React render tree, and the strings are composed from
 * HTML fragments (`<b>`) the template owns.
 *
 * Km mirrors messages/km.json's vocabulary. Anything missing falls back to en.
 */
export type EmailLocale = "en" | "km";

export interface EmailStrings {
  brandSubjectPrefix: string;
  ignoreLine: string;
  fallbackLink: string;
  verify: { subject: string; title: string; body: string; cta: string; pre: string };
  setPassword: {
    subject: string;
    title: string;
    cta: string;
    admin: string;
    created: (a: { actor: string; on: string }) => string;
    expires: (date: string) => string;
    singleUse: string;
    pre: (actor: string) => string;
  };
  invite: {
    subject: (team: string) => string;
    title: (team: string) => string;
    cta: string;
    someone: string;
    body: (a: { actor: string; team: string; role: string }) => string;
    expires: (date: string) => string;
    pre: (a: { actor: string; team: string }) => string;
  };
  reset: {
    subject: string;
    title: string;
    cta: string;
    body: string;
    expires: (date: string) => string;
    singleUse: string;
    pre: string;
  };
  on: (team: string) => string;
  roles: Record<string, string>;
}

const en: EmailStrings = {
  brandSubjectPrefix: "Kamnotheat — ",
  ignoreLine:
    "If you weren't expecting this, you can ignore this email — nothing happens until you open the link.",
  fallbackLink: "If the button doesn't work, use this link:",
  verify: {
    subject: "verify your email",
    title: "Verify your email",
    body: "Confirm this address to activate your Kamnotheat account. The link is single-use and expires 1 hour after it was sent.",
    cta: "Verify email",
    pre: "Single-use link, expires in 1 hour.",
  },
  setPassword: {
    subject: "set your password",
    title: "Set your password",
    cta: "Set password",
    admin: "An administrator",
    created: ({ actor, on }) =>
      `${actor} created a Kamnotheat account for you${on}. Set a password to sign in.`,
    expires: (d) => ` The link is single-use and expires on ${d}.`,
    singleUse: " The link is single-use.",
    pre: (a) => `${a} created this account for you.`,
  },
  invite: {
    subject: (t) => `you're invited to ${t}`,
    title: (t) => `Join ${t}`,
    cta: "Accept invite",
    someone: "Someone",
    body: ({ actor, team, role }) =>
      `${actor} invited you to join ${team} on Kamnotheat as ${role}. Accepting will create or link your account.`,
    expires: (d) => ` This invite expires on ${d}.`,
    pre: ({ actor, team }) => `${actor} invited you to join ${team}.`,
  },
  reset: {
    subject: "reset your password",
    title: "Reset your password",
    cta: "Reset password",
    body: "Someone asked to reset the Kamnotheat password for this address. Open the link below to choose a new one.",
    expires: (d) => ` The link is single-use and expires on ${d}.`,
    singleUse: " The link is single-use and expires in 1 hour.",
    pre: "You asked to reset your password. Single-use link, expires in 1 hour.",
  },
  on: (t) => ` on ${t}`,
  roles: {
    admin: "an <b>admin</b> — full access to the console, including team and location management",
    manager: "a <b>manager</b> — you can manage locations, quests and logs for the team",
    member: "a <b>member</b> — you can check in and out and see your own logs",
    auditor: "an <b>auditor</b> — read-only access to logs and reports",
  },
};

const km: EmailStrings = {
  brandSubjectPrefix: "Kamnotheat — ",
  ignoreLine:
    "ប្រសិនបើអ្នកមិនបានរំពឹងអ៊ីមែលនេះទេ អ្នកអាចព្រងើយកន្តើយបាន — គ្មានអ្វីកើតឡើងទេ រហូតដល់អ្នកបើកតំណ។",
  fallbackLink: "ប្រសិនបើប៊ូតុងមិនដំណើរការ សូមប្រើតំណនេះ៖",
  verify: {
    subject: "ផ្ទៀងផ្ទាត់អ៊ីមែលរបស់អ្នក",
    title: "ផ្ទៀងផ្ទាត់អ៊ីមែលរបស់អ្នក",
    body: "បញ្ជាក់អាសយដ្ឋាននេះដើម្បីធ្វើឱ្យគណនី Kamnotheat របស់អ្នកសកម្ម។ តំណនេះប្រើបានតែម្តង ហើយផុតកំណត់ ១ ម៉ោងបន្ទាប់ពីបានផ្ញើ។",
    cta: "ផ្ទៀងផ្ទាត់អ៊ីមែល",
    pre: "តំណប្រើបានតែម្តង ផុតកំណត់ក្នុង ១ ម៉ោង។",
  },
  setPassword: {
    subject: "កំណត់ពាក្យសម្ងាត់របស់អ្នក",
    title: "កំណត់ពាក្យសម្ងាត់របស់អ្នក",
    cta: "កំណត់ពាក្យសម្ងាត់",
    admin: "អ្នកគ្រប់គ្រង",
    created: ({ actor, on }) =>
      `${actor} បានបង្កើតគណនី Kamnotheat សម្រាប់អ្នក${on}។ សូមកំណត់ពាក្យសម្ងាត់ដើម្បីចូល។`,
    expires: (d) => ` តំណនេះប្រើបានតែម្តង ហើយផុតកំណត់នៅ ${d}។`,
    singleUse: " តំណនេះប្រើបានតែម្តង។",
    pre: (a) => `${a} បានបង្កើតគណនីនេះសម្រាប់អ្នក។`,
  },
  invite: {
    subject: (t) => `អ្នកត្រូវបានអញ្ជើញចូល ${t}`,
    title: (t) => `ចូលរួម ${t}`,
    cta: "ទទួលយកការអញ្ជើញ",
    someone: "នរណាម្នាក់",
    body: ({ actor, team, role }) =>
      `${actor} បានអញ្ជើញអ្នកឱ្យចូលរួម ${team} នៅលើ Kamnotheat ជា ${role}។ ការទទួលយកនឹងបង្កើត ឬភ្ជាប់គណនីរបស់អ្នក។`,
    expires: (d) => ` ការអញ្ជើញនេះផុតកំណត់នៅ ${d}។`,
    pre: ({ actor, team }) => `${actor} បានអញ្ជើញអ្នកឱ្យចូលរួម ${team}។`,
  },
  reset: {
    subject: "កំណត់ពាក្យសម្ងាត់របស់អ្នកឡើងវិញ",
    title: "កំណត់ពាក្យសម្ងាត់របស់អ្នកឡើងវិញ",
    cta: "កំណត់ពាក្យសម្ងាត់ឡើងវិញ",
    body: "នរណាម្នាក់បានស្នើសុំកំណត់ពាក្យសម្ងាត់ Kamnotheat សម្រាប់អាសយដ្ឋាននេះឡើងវិញ។ សូមបើកតំណខាងក្រោមដើម្បីជ្រើសរើសពាក្យសម្ងាត់ថ្មី។",
    expires: (d) => ` តំណនេះប្រើបានតែម្តង ហើយផុតកំណត់នៅ ${d}។`,
    singleUse: " តំណនេះប្រើបានតែម្តង ហើយផុតកំណត់ក្នុង ១ ម៉ោង។",
    pre: "អ្នកបានស្នើសុំកំណត់ពាក្យសម្ងាត់ឡើងវិញ។ តំណប្រើបានតែម្តង ផុតកំណត់ក្នុង ១ ម៉ោង។",
  },
  on: (t) => ` នៅលើ ${t}`,
  roles: {
    admin: "<b>អ្នកគ្រប់គ្រង</b> — មានសិទ្ធិពេញលេញចូលកុងសូល រួមទាំងការគ្រប់គ្រងក្រុម និងទីតាំង",
    manager: "<b>អ្នកចាត់ការ</b> — អ្នកអាចគ្រប់គ្រងទីតាំង បេសកកម្ម និងកំណត់ត្រាសម្រាប់ក្រុម",
    member: "<b>សមាជិក</b> — អ្នកអាចចូល ចេញ និងមើលកំណត់ត្រារបស់អ្នកផ្ទាល់",
    auditor: "<b>អ្នកសវនកម្ម</b> — មានសិទ្ធិអានតែកំណត់ត្រា និងរបាយការណ៍",
  },
};

export const EMAIL_STRINGS: Record<EmailLocale, EmailStrings> = { en, km };

export function isEmailLocale(v: unknown): v is EmailLocale {
  return v === "en" || v === "km";
}
