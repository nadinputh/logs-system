'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { generateQRSVG } from '@/lib/qr'

interface QRCodeDisplayProps {
  url: string
  label: string
  sublabel?: string
}

export default function QRCodeDisplay({ url, label, sublabel }: QRCodeDisplayProps) {
  const [svgContent, setSvgContent] = useState('')

  useEffect(() => {
    generateQRSVG(url).then(setSvgContent)
  }, [url])

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="w-64 h-64 print:w-48 print:h-48"
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
      <div className="text-center">
        <p className="font-semibold">{label}</p>
        {sublabel && <p className="text-sm text-muted-foreground">{sublabel}</p>}
        <p className="text-xs text-muted-foreground mt-1 break-all max-w-xs">{url}</p>
      </div>
      <Button
        onClick={() => window.print()}
        variant="outline"
        className="print:hidden"
      >
        Print QR Code
      </Button>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: fixed; left: 0; top: 0; }
        }
      `}</style>
    </div>
  )
}
