import { redirect } from 'next/navigation'

// Passkeys merged into /settings/security (2026-09-04 critique: the two
// pages shared one mental model — "how do I get into my account" — and this
// route's own "Sessions mirror" card was already admitting the split cost
// users a click). Kept as a redirect so old links and bookmarks still land
// somewhere real.
export default function PasskeysSettingsRedirect() {
  redirect('/settings/security')
}
