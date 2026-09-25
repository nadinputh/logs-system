'use client'

import { MapContainer, TileLayer, Polygon, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { Button } from '@/components/ui/button'

// [lat, lng] pairs — the familiar order for the map UI. Flipped to GeoJSON's
// [lng, lat] only at save time (see verticesToGeofence in the buildings page).
export type LatLng = [number, number]

interface Props {
  value: LatLng[]
  onChange: (vertices: LatLng[]) => void
  center: LatLng
}

function ClickCapture({ onAdd }: { onAdd: (pos: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onAdd([e.latlng.lat, e.latlng.lng])
    },
  })
  return null
}

export default function GeofenceMapPicker({ value, onChange, center }: Props) {
  return (
    <div className="space-y-2">
      <div className="h-64 w-full overflow-hidden rounded-lg border border-border">
        <MapContainer center={center} zoom={18} className="h-full w-full">
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickCapture onAdd={(pos) => onChange([...value, pos])} />
          {value.length > 1 && (
            <Polygon positions={value} pathOptions={{ color: '#0891b2' }} />
          )}
        </MapContainer>
      </div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {value.length} point{value.length !== 1 ? 's' : ''} — click the map to add a vertex (min 3)
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange([])}
          disabled={value.length === 0}
        >
          Clear
        </Button>
      </div>
    </div>
  )
}
