'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { generateQRSVG } from '@/lib/qr'

interface RoundedQRCodeProps {
  value: string
  size?: number
  className?: string
}

export function RoundedQRCode({ value, size = 240, className }: RoundedQRCodeProps) {
  const label = useTranslations('common')('qrCode')
  const [svgContent, setSvgContent] = useState('')

  useEffect(() => {
    let mounted = true

    generateQRSVG(value, { label }).then((svg) => {
      if (mounted) setSvgContent(svg)
    })

    return () => {
      mounted = false
    }
  }, [value, label])

  return (
    <div
      className={className}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  )
}
