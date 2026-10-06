import LocationQrPanel from '@/components/admin/LocationQrPanel'
import Link from 'next/link'
import { connectDB } from '@/lib/db'
import { Building } from '@/lib/models/Building'
import { Floor } from '@/lib/models/Floor'
import { Room } from '@/lib/models/Room'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

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
  const t = await getTranslations('adminQrPage')
  const location = await getLocation(id)

  if (!location) {
    return (
      <div className="p-8">
        <p className="text-[var(--status-danger)]">{t('locationNotFound')}</p>
      </div>
    )
  }

  const appUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const qrUrl = `${appUrl}/scan/${id}`
  const sublabel =
    location.locationType === 'room'
      ? t('floorLine', { number: location.floorId?.number, building: location.buildingId?.name })
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
      ? t('backToRooms')
      : location.locationType === 'floor'
      ? t('backToFloors')
      : t('backToBuildings')

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm print-area">
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center gap-1.5 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-muted/60 hover:text-foreground print:hidden"
        >
          <ArrowLeft className="size-3.5" />
          {backLabel}
        </Link>
        <LocationQrPanel
          locationId={id}
          locationType={location.locationType}
          initialLiveOnly={!!location.requireDynamicQr}
          initialCheckInMode={location.checkInMode ?? 'click'}
          qrUrl={qrUrl}
          label={location.name}
          sublabel={sublabel}
          title={t('locationQrCode')}
          subtitle={t('scanToCheckInOut')}
        />
      </div>
    </div>
  )
}
