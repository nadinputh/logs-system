import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { pickClientIp } from '@/lib/server/getClientIp'
import CheckInOutClient from '@/components/location/CheckInOut'
import { ScanNotice } from '@/components/location/ScanNotice'
import { headers } from 'next/headers'
import { signKioskToken, verifyKioskToken } from '@/lib/jwt'
import { createHash } from 'node:crypto'
import { claim } from '@/lib/claim'
import { claimScan } from '@/lib/kioskGate'
import { connectDB } from '@/lib/db'
import { Building } from '@/lib/models/Building'
import { Floor } from '@/lib/models/Floor'
import { Room } from '@/lib/models/Room'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The page is public (anyone with the QR); never send teamId, geofence, etc.
const PUBLIC_FIELDS = 'name number description checkInMode requireDynamicQr'

function toPlain(doc: any) {
  return JSON.parse(JSON.stringify(doc))
}

async function getLocation(locationId: string) {
  try {
    await connectDB()
    const room = await Room.findById(locationId)
      .select(PUBLIC_FIELDS)
      .populate('floorId', 'number name')
      .populate('buildingId', 'name address')
      .lean<any>()
    if (room) return { ...toPlain(room), locationType: 'room' }

    const floor = await Floor.findById(locationId)
      .select(PUBLIC_FIELDS + ' number')
      .populate('buildingId', 'name address')
      .lean<any>()
    if (floor) return { ...toPlain(floor), locationType: 'floor' }

    const building = await Building.findById(locationId).select(PUBLIC_FIELDS + ' address').lean<any>()
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
  const t = await getTranslations('scanNotice')

  // A scanned kiosk QR carries a signed JWT. Mismatch is a hard stop; an expired
  // or bad token just means "no presence proof", and the client decides what
  // that allows: check-out and static-QR locations still work, a live-QR
  // location refuses a new check-in.
  let presenceToken: string | undefined
  if (resolvedSearchParams.token) {
    try {
      const verified = await verifyKioskToken(resolvedSearchParams.token)
      if (verified.locationId !== locationId) {
        return (
          <ScanNotice
            tone="danger"
            icon="mismatch"
            title={t('mismatchTitle')}
            detail={t('mismatchDetail')}
          />
        )
      }
      // Proof of scan, carried to POST /api/logs; outlives the 15s QR so the
      // visitor has time to complete the form. Minted only for the device that
      // first presented this QR, so a forwarded URL earns no presence proof.
      const h = await headers()
      const fingerprint = `${pickClientIp(h.get('x-forwarded-for'), h.get('x-real-ip'))}|${h.get('user-agent') ?? ''}`
      if (
        verified.typ === 'qr' &&
        verified.jti &&
        (await claimScan(verified.jti, fingerprint)) &&
        // One presence token per device per QR: otherwise reloading within the
        // QR's 15s hands one scan to as many scripted sessions as the visitor likes.
        (await claim(
          `kioskmint:${verified.jti}:${createHash('sha256').update(fingerprint).digest('hex').slice(0, 16)}`,
          fingerprint,
        )) === null
      ) {
        presenceToken = await signKioskToken(locationId, '5m', 'presence')
      }
    } catch {
      presenceToken = undefined
    }
  }

  const location = await getLocation(locationId)

  return (
    <Suspense>
      <CheckInOutClient locationId={locationId} initialLocation={location} kioskToken={presenceToken} />
    </Suspense>
  )
}
