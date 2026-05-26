import dynamic from 'next/dynamic'

const QRScanner = dynamic(() => import('@/components/scanner/QRScanner'), {
  ssr: false,
  loading: () => (
    <div className="h-64 flex items-center justify-center">
      <svg className="w-6 h-6 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  ),
})

export default function ScanPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-violet-50/20 flex items-start justify-center p-4 pt-10 pb-16">
      <div className="w-full max-w-sm space-y-4">
        {/* Header */}
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-3 shadow-sm shadow-indigo-200">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-foreground">Scan QR Code</h1>
          <p className="text-sm text-muted-foreground mt-1">Point your camera at a location QR code to check in</p>
        </div>

        {/* Scanner card */}
        <div className="bg-white rounded-2xl border border-border/60 shadow-sm overflow-hidden">
          <div className="h-1.5 w-full gradient-primary" />
          <div className="p-5">
            <QRScanner />
          </div>
        </div>
      </div>
    </div>
  )
}
