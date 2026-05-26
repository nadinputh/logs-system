import QRCodeDisplay from '@/components/admin/QRCodeDisplay'
import { connectDB } from '@/lib/db'
import { Building } from '@/lib/models/Building'
import { Floor } from '@/lib/models/Floor'
import { Room } from '@/lib/models/Room'

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

export default async function AdminQRPage({ params }: { params: { id: string } }) {
  const location = await getLocation(params.id)

  if (!location) {
    return (
      <div className="p-8">
        <p className="text-red-500">Location not found</p>
      </div>
    )
  }

  const appUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const qrUrl = `${appUrl}/scan/${params.id}`
  const sublabel =
    location.locationType === 'room'
      ? `Floor ${location.floorId?.number} · ${location.buildingId?.name}`
      : location.locationType === 'floor'
      ? location.buildingId?.name
      : location.address

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="bg-white rounded-2xl border border-border/60 shadow-sm overflow-hidden w-full max-w-sm print-area">
        <div className="h-1.5 w-full gradient-primary" />
        <div className="p-6">
          <div className="mb-4">
            <p className="text-sm font-semibold text-foreground">QR Code</p>
            <p className="text-xs text-muted-foreground mt-0.5">Scan to check in / out</p>
          </div>
          <div className="flex justify-center">
            <QRCodeDisplay url={qrUrl} label={location.name} sublabel={sublabel} />
          </div>
        </div>
      </div>
    </div>
  )
}
