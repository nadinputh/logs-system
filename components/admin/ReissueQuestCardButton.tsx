'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from '@/components/ui/sonner'
import { useTranslations } from 'next-intl'
import { useApiError } from '@/lib/useApiError'

export default function ReissueQuestCardButton({ questId }: { questId: string }) {
  const t = useTranslations('adminReissue')
  const apiError = useApiError()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleReissue() {
    setLoading(true)
    try {
      const res = await fetch(`/api/quests/${questId}/reissue`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(apiError(data, t('failedToReissueCard')))
      toast.success(t('newQrIssuedTheLost'))
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('failedToReissueCard'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <Button type="button" variant="outline" size="sm" className="shrink-0" />
      }>
        <RefreshCw className="size-3.5" aria-hidden />
        {t('cardLostReissue')}
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('reissueThisQuestCard')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-muted">{t('body')}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              {t('cancel')}
            </Button>
            <Button type="button" variant="mono" onClick={handleReissue} disabled={loading}>
              {loading ? t('reissuing') : t('reissueCard')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
