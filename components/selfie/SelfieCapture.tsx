'use client'

import { useEffect, useRef, useState } from 'react'
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
  const blobRef = useRef<Blob | null>(null)
  /** The live object URL, mirrored in a ref so unmount cleanup can revoke the
   *  current one rather than whatever value it closed over at mount. */
  const objectUrlRef = useRef<string | null>(null)
  const [started, setStarted] = useState(false)
  /** An object URL for the pending photo, not a base64 copy of it. */
  const [captured, setCaptured] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [handingOff, setHandingOff] = useState(false)
  const [error, setError] = useState('')

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  function discardCapture() {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = null
    blobRef.current = null
  }

  // The parent unmounts this the moment the step leaves 'selfie', and nothing
  // stopped the tracks on the way out — the stream stayed live and the camera
  // indicator stayed lit, on the one flow whose disclosure promises the camera
  // feed never leaves the device.
  useEffect(() => {
    // Both resources outlive React if nothing releases them: the camera stays
    // lit, and an object URL pins its blob until revoked. This component is
    // unmounted the moment the step advances, so cleanup has to do both — and
    // has to read them from refs, because a cleanup registered once at mount
    // closes over the state as it was then, which is to say empty.
    return () => {
      stopCamera()
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setError('')
      setStarted(true)
    } catch {
      setError('Camera access denied. You can skip the photo.')
    }
  }

  // Both hand-offs start an irreversible write in the parent, which cannot see
  // this component's state — so re-entry is refused here.
  function handOff(run: () => void) {
    if (handingOff) return
    setHandingOff(true)
    stopCamera()
    run()
  }

  function capture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('That photo could not be saved. Try again, or skip it.')
          return
        }
        discardCapture()
        const url = URL.createObjectURL(blob)
        blobRef.current = blob
        objectUrlRef.current = url
        setCaptured(url)
        stopCamera()
      },
      'image/jpeg',
      0.85,
    )
  }

  function retake() {
    discardCapture()
    setCaptured(null)
    setStarted(false)
    startCamera()
  }

  async function confirm() {
    const blob = blobRef.current
    if (!blob || uploading || handingOff) return
    setUploading(true)
    setError('')
    try {
      const url = await uploadSelfie(blob)
      handOff(() => onCapture(url))
    } catch {
      setError('Photo upload failed. You can skip it, or try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      {!started && !captured && (
        <div className="space-y-2">
          <Button size="touch" onClick={startCamera} variant="outline" className="w-full">
            Take Selfie (optional)
          </Button>
          <Button
            size="touch"
            onClick={() => handOff(onSkip)}
            variant="ghost"
            className="w-full"
            isLoading={handingOff}
            loadingBehavior="busy"
          >
            {handingOff ? 'Checking in…' : 'Skip'}
          </Button>
          <p role="alert" className="text-sm text-[var(--status-danger)] empty:hidden">
            {error}
          </p>
        </div>
      )}

      {started && !captured && (
        <div className="space-y-2">
          {/* `muted` is required for autoplay under iOS Safari's policy. The
              stream is video-only today, so it plays without it — but that is
              an accident of the constraints, not a guarantee. */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="aspect-[4/3] w-full max-h-[min(45vh,20rem)] rounded-lg object-cover [@media(max-height:540px)]:aspect-auto [@media(max-height:540px)]:h-28 bg-black"
          />
          <Button size="touch" onClick={capture} className="w-full">Capture</Button>
          <Button size="touch" onClick={() => { stopCamera(); setStarted(false) }} variant="ghost" className="w-full">Cancel</Button>
        </div>
      )}

      {captured && (
        <div className="space-y-2">
          <img
            src={captured}
            alt="The photo you just took, for review before it is uploaded"
            className="aspect-[4/3] w-full max-h-[min(45vh,20rem)] rounded-lg object-cover [@media(max-height:540px)]:aspect-auto [@media(max-height:540px)]:h-28 bg-black"
          />
          <Button
            size="touch"
            onClick={confirm}
            className="w-full"
            isLoading={uploading || handingOff}
            loadingBehavior="busy"
          >
            {uploading ? 'Uploading…' : 'Use this photo'}
          </Button>
          <Button size="touch" onClick={retake} variant="outline" className="w-full">Retake</Button>
          <Button
            size="touch"
            onClick={() => handOff(onSkip)}
            variant="ghost"
            className="w-full"
            isLoading={handingOff}
            loadingBehavior="busy"
          >
            {handingOff ? 'Checking in…' : 'Skip'}
          </Button>
          <p role="alert" className="text-sm text-[var(--status-danger)] empty:hidden">
            {error}
          </p>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
