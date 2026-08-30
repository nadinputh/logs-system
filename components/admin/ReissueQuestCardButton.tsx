'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from '@/components/ui/sonner'
import { readApiError } from '@/lib/clientFetch'

export default function ReissueQuestCardButton({ questId }: { questId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleReissue() {
    setLoading(true)
    try {
      const res = await fetch(`/api/quests/${questId}/reissue`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(readApiError(data, 'Failed to reissue card'))
      toast.success('New QR issued — the lost one no longer works')
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reissue card')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* This trigger sits inside the Steps card, which — like the QR export
          card beside it — is hardcoded bg-white so it stays legible on a
          printed sheet regardless of app theme. A themed Button variant
          (outline/ghost/mono all resolve --foreground) turns white-on-white
          in dark mode; fixed neutral classes match the rest of this card's
          own text instead. */}
      <DialogTrigger render={
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        />
      }>
        <RefreshCw className="size-3.5" aria-hidden />
        Card lost? Reissue
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Reissue this quest card?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-muted">
            The old QR code stops working immediately, so whoever finds the lost card can&apos;t
            use or claim it. This card&apos;s progress is kept — scan the new QR below to
            continue exactly where it left off.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="button" variant="mono" onClick={handleReissue} disabled={loading}>
              {loading ? 'Reissuing…' : 'Reissue Card'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
