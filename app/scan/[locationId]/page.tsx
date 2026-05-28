import { Suspense } from 'react'
import CheckInOutClient from '@/components/location/CheckInOut'
import { verifyKioskToken } from '@/lib/jwt'
import { connectDB } from '@/lib/db'
import { Building } from '@/lib/models/Building'
import { Floor } from '@/lib/models/Floor'
import { Room } from '@/lib/models/Room'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function toPlain(doc: any) {
  return JSON.parse(JSON.stringify(doc))
}

async function getLocation(locationId: string) {
  try {
    await connectDB()
    const room = await Room.findById(locationId)
      .populate('floorId')
      .populate('buildingId')
      .lean<any>()
    if (room) return { ...toPlain(room), locationType: 'room' }

    const floor = await Floor.findById(locationId).populate('buildingId').lean<any>()
    if (floor) return { ...toPlain(floor), locationType: 'floor' }

    const building = await Building.findById(locationId).lean<any>()
    if (building) return { ...toPlain(building), locationType: 'building' }

    return null
  } catch {
    return null
  }
}

export default async function ScanLocationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locationId: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { locationId } = await params
  const resolvedSearchParams = await searchParams

  // When a dynamic kiosk QR is scanned it carries a signed JWT — verify it server-side
  if (resolvedSearchParams.token && process.env.KIOSK_SECRET) {
    try {
      const verified = await verifyKioskToken(resolvedSearchParams.token)
      if (verified.locationId !== locationId) {
        return (
          <div className="min-h-screen flex items-center justify-center p-4">
            <p className="text-red-500 font-medium">Invalid QR code — location mismatch.</p>
          </div>
        )
      }
    } catch {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <p className="text-amber-600 font-medium">
            QR code expired. Please scan the refreshed code on the kiosk.
          </p>
        </div>
      )
    }
  }

  const location = await getLocation(locationId)

  return (
    <Suspense>
      <CheckInOutClient locationId={locationId} initialLocation={location} />
    </Suspense>
  )
}
