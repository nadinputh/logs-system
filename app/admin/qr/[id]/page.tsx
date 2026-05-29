import QRCodeDisplay from '@/components/admin/QRCodeDisplay'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { connectDB } from '@/lib/db'
import { Building } from '@/lib/models/Building'
import { Floor } from '@/lib/models/Floor'
import { Room } from '@/lib/models/Room'
import { ArrowLeft, MapPin, QrCode } from 'lucide-react'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getLocation(id: string) {
  try {
    await connectDB()
    const room = await Room.findById(id).populate('floorId').populate('buildingId').lean<any>()
    if (room) return { ...JSON.parse(JSON.stringify(room)), locationType: 'room' }

    const floor = await Floor.findById(id).populate('buildingId').lean<any>()
    if (floor) return { ...JSON.parse(JSON.stringify(floor)), locationType: 'floor' }

    const building = await Building.findById(id).lean<any>()
    if (building) return { ...JSON.parse(JSON.stringify(building)), locationType: 'building' }

    return null
  } catch (err: any) {
    console.error('[AdminQRPage] getLocation error:', err?.message ?? err)
    return null
  }
}

export default async function AdminQRPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const location = await getLocation(id)

  if (!location) {
    return (
      <div className="p-8">
        <p className="text-red-500">Location not found</p>
      </div>
    )
  }

  const appUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const qrUrl = `${appUrl}/scan/${id}`
  const sublabel =
    location.locationType === 'room'
      ? `Floor ${location.floorId?.number} · ${location.buildingId?.name}`
      : location.locationType === 'floor'
      ? location.buildingId?.name
      : location.address
  const backHref =
    location.locationType === 'room'
      ? `/admin/rooms?floorId=${location.floorId?._id ?? location.floorId}`
      : location.locationType === 'floor'
      ? `/admin/floors?buildingId=${location.buildingId?._id ?? location.buildingId}`
      : '/admin/buildings'
  const backLabel =
    location.locationType === 'room'
      ? 'Back to rooms'
      : location.locationType === 'floor'
      ? 'Back to floors'
      : 'Back to buildings'

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm print-area">
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center gap-1.5 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground print:hidden"
        >
          <ArrowLeft className="size-3.5" />
          {backLabel}
        </Link>
        <Card className="overflow-hidden bg-white" data-qr-export-card="true">
          <CardContent className="p-5 sm:p-6">
            <div className="mx-auto w-full max-w-[17.625rem]">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl gradient-primary text-white shadow-sm shadow-cyan-200">
                  <QrCode className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-base font-semibold text-foreground">Location QR Code</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="size-3.5" />
                    Scan to check in / out
                  </p>
                </div>
              </div>
              <div className="flex justify-center">
                <QRCodeDisplay
                  url={qrUrl}
                  label={location.name}
                  sublabel={sublabel}
                  exportTitle="Location QR Code"
                  exportDescription="Scan to check in / out"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
