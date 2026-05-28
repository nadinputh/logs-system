'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { uploadSelfie } from '@/lib/cloudinary'

interface SelfieCaptureProps {
  onCapture: (url: string) => void
  onSkip: () => void
}

export default function SelfieCapture({ onCapture, onSkip }: SelfieCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [started, setStarted] = useState(false)
  const [captured, setCaptured] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setStarted(true)
    } catch {
      setError('Camera access denied. You can skip the selfie.')
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  function capture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    setCaptured(dataUrl)
    stopCamera()
  }

  function retake() {
    setCaptured(null)
    setStarted(false)
    startCamera()
  }

  async function confirm() {
    if (!captured) return
    setUploading(true)
    try {
      const res = await fetch(captured)
      const blob = await res.blob()
      const url = await uploadSelfie(blob)
      onCapture(url)
    } catch {
      setError('Photo upload failed. You can skip or try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      {!started && !captured && (
        <div className="space-y-2">
          <Button onClick={startCamera} variant="outline" className="w-full">
            Take Selfie (optional)
          </Button>
          <Button onClick={onSkip} variant="ghost" className="w-full">
            Skip
          </Button>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      )}

      {started && !captured && (
        <div className="space-y-2">
          <video ref={videoRef} autoPlay playsInline className="w-full rounded-lg" />
          <Button onClick={capture} className="w-full">Capture</Button>
          <Button onClick={() => { stopCamera(); setStarted(false) }} variant="ghost" className="w-full">Cancel</Button>
        </div>
      )}

      {captured && (
        <div className="space-y-2">
          <img src={captured} alt="Selfie preview" className="w-full rounded-lg" />
          <Button onClick={confirm} className="w-full" disabled={uploading}>
            {uploading ? 'Uploading…' : 'Use this photo'}
          </Button>
          <Button onClick={retake} variant="outline" className="w-full">Retake</Button>
          <Button onClick={onSkip} variant="ghost" className="w-full">Skip</Button>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
