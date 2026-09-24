'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogIcon, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/components/ui/sonner'
import { readApiError } from '@/lib/clientFetch'

const ACTIONS: Array<{ key: string; label: string; variant: 'brand' | 'outline' | 'destructive' | 'ghost' }> = [
  { key: 'renew_success', label: 'Simulate next renewal — Success', variant: 'brand' },
  { key: 'renew_failure', label: 'Simulate next renewal — Payment fails', variant: 'outline' },
  { key: 'cancel_at_period_end', label: 'Cancel at period end', variant: 'outline' },
  { key: 'resume', label: 'Resume (undo cancel)', variant: 'outline' },
  { key: 'cancel_now', label: 'Cancel immediately', variant: 'destructive' },
]

export function MockPortalActions({ customerId, returnUrl }: { customerId: string; returnUrl: string }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmCancelNow, setConfirmCancelNow] = useState(false)
  const router = useRouter()

  async function run(action: string) {
    setBusy(action)
    try {
      const res = await fetch(`/api/dev/billing/portal/${encodeURIComponent(customerId)}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(readApiError(payload, 'Could not run that action.'))

      toast.success('Done — refreshing this page.')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not run that action.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        {ACTIONS.map((a) => (
          <Button
            key={a.key}
            variant={a.variant}
            // See the comment on the destructive buttons below for why
            // "cancel_now" also gets a background override; every other
            // action here just gets the padding note from
            // MockCheckoutActions.tsx (border-box height is fixed, this
            // reshapes the interior padding box without changing it).
            className={a.key === 'cancel_now' ? 'bg-[#b42318] py-1.5 hover:bg-[#9c1e14]' : 'py-1.5'}
            isDisabled={busy !== null}
            isLoading={busy === a.key}
            loadingBehavior="disable"
            onPress={() => (a.key === 'cancel_now' ? setConfirmCancelNow(true) : run(a.key))}
          >
            {a.label}
          </Button>
        ))}
      </div>
      <Button variant="ghost" className="py-1.5" onPress={() => { window.location.href = returnUrl }}>
        Back to app
      </Button>

      <Dialog open={confirmCancelNow} onOpenChange={(open) => { if (!open && busy === null) setConfirmCancelNow(false) }}>
        <DialogContent size="xs">
          <DialogHeader>
            {/* Pinned to the same fixed #b42318 as the confirm button below,
                not the theme-varying --status-danger (whose dark-mode value,
                #f87171, is tuned for text-on-wash, not a solid button fill —
                using it here would put a visibly different, lighter red on
                this icon than on the button two inches below it). */}
            <DialogIcon className="size-12 rounded-full bg-[#b42318]/10 text-[#b42318]">
              <Ban className="size-5" aria-hidden />
            </DialogIcon>
            <DialogTitle className="mt-4 text-xl font-semibold tracking-normal">
              Cancel this subscription immediately?
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="mt-3 text-sm leading-6 text-muted">
            This ends access right away — not at the end of the current period. This can&apos;t be undone from here;
            the team would need to check out again to resubscribe.
          </DialogBody>
          <DialogFooter className="mt-5 gap-2">
            <Button variant="outline" size="sm" onPress={() => setConfirmCancelNow(false)} isDisabled={busy !== null}>
              Keep subscription
            </Button>
            <Button
              variant="destructive"
              size="sm"
              // HeroUI's own danger-button fill measures ~3.5:1 for a white
              // label — a known, deliberate, app-wide tradeoff recorded in
              // app/globals.css (retuning --danger there would also change
              // every other destructive button in the app). This is the
              // single most consequential control in the whole billing
              // surface — an immediate, unrecoverable cancellation — so it
              // gets a scoped exception: this app's own --status-danger red
              // (already used elsewhere as a semantic danger color, just
              // not as a solid fill) clears 4.5:1 against white here.
              className="bg-[#b42318] hover:bg-[#9c1e14]"
              onPress={() => {
                setConfirmCancelNow(false)
                run('cancel_now')
              }}
              isLoading={busy === 'cancel_now'}
              loadingBehavior="busy"
            >
              Cancel immediately
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
