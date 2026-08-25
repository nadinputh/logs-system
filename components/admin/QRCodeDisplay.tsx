'use client'

import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { RoundedQRCode } from '@/components/qr/RoundedQRCode'
import { Download } from 'lucide-react'

interface QRCodeDisplayProps {
  url: string
  label: string
  sublabel?: string
  exportTitle?: string
  exportDescription?: string
}

function sanitizeFilename(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'qr-code'
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a')

  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export default function QRCodeDisplay({ url, label, sublabel, exportTitle = 'QR Code', exportDescription = 'Scan to open' }: QRCodeDisplayProps) {
  const downloadButtonRef = useRef<HTMLButtonElement>(null)

  const handleDownloadPNG = async () => {
    const exportCard = downloadButtonRef.current?.closest('[data-qr-export-card="true"]') as HTMLElement | null
    if (!exportCard) return

    const { toPng } = await import('html-to-image')
    const excludedElements = Array.from(exportCard.querySelectorAll<HTMLElement>('[data-qr-download-exclude="true"]'))
    const previousDisplay = excludedElements.map((element) => element.style.display)

    try {
      excludedElements.forEach((element) => {
        element.style.display = 'none'
      })
      await new Promise((resolve) => requestAnimationFrame(resolve))

      const dataUrl = await toPng(exportCard, {
        cacheBust: true,
        pixelRatio: 3,
      })

      downloadDataUrl(dataUrl, `${sanitizeFilename(label)}-qr-code.png`)
    } finally {
      excludedElements.forEach((element, index) => {
        element.style.display = previousDisplay[index]
      })
    }
  }

  return (
    <div className="flex w-full max-w-[17.625rem] flex-col items-center gap-4">
      <div className="rounded-[2rem] border border-border/60 bg-white p-3 shadow-sm shadow-black/10 print:p-2 print:shadow-none">
        <RoundedQRCode value={url} size={256} className="print:!h-48 print:!w-48" />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-foreground">{label}</p>
        {sublabel && <p className="mt-0.5 text-sm text-muted">{sublabel}</p>}
        <p className="mt-2 max-w-full break-all rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted">{url}</p>
      </div>
      <Button
        ref={downloadButtonRef}
        onClick={handleDownloadPNG}
        className="print:hidden"
        data-qr-download-exclude="true"
        size="sm"
      >
        <Download className="mr-2 size-4" />
        Download PNG
      </Button>
    </div>
  )
}
