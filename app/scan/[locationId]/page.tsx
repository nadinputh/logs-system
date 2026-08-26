import { Suspense } from 'react'
import CheckInOutClient from '@/components/location/CheckInOut'
import { ScanNotice } from '@/components/location/ScanNotice'
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
          <ScanNotice
            tone="danger"
            icon="mismatch"
            title="That code is for a different place"
            detail="The code you scanned was issued for another location, so it cannot check you in here. Nothing has been recorded."
          />
        )
      }
    } catch {
      return (
        <ScanNotice
          tone="warning"
          icon="expired"
          title="That code has expired"
          detail="Kiosk codes refresh every few seconds so they cannot be photographed and reused. Scan the one on screen now. Nothing has been recorded."
        />
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
