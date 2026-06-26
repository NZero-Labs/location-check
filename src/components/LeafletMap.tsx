'use client'
import { useEffect } from 'react'
import { MapContainer, TileLayer, GeoJSON, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default marker icons in webpack/Next.js environments
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function FitAll({
  geojson,
  marker,
}: {
  geojson: GeoJSON.FeatureCollection | null
  marker: [number, number] | null
}) {
  const map = useMap()
  useEffect(() => {
    try {
      if (geojson && marker) {
        const layer = L.geoJSON(geojson)
        const bounds = layer.getBounds()
        if (bounds.isValid()) {
          bounds.extend(marker)
          map.fitBounds(bounds, { padding: [40, 40] })
        } else {
          map.setView(marker, 13)
        }
      } else if (geojson) {
        const layer = L.geoJSON(geojson)
        const bounds = layer.getBounds()
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] })
      } else if (marker) {
        map.setView(marker, 13)
      }
    } catch {}
  }, [geojson, marker, map])
  return null
}

const estadoStyle: L.PathOptions = {
  color: '#3b82f6', weight: 1, fillColor: '#93c5fd', fillOpacity: 0.2,
}
const municipioStyle: L.PathOptions = {
  color: '#10b981', weight: 2, fillColor: '#6ee7b7', fillOpacity: 0.3,
}

interface LeafletMapProps {
  estadoGeojson: GeoJSON.FeatureCollection | null
  municipioGeojson: GeoJSON.FeatureCollection | null
  estadoId?: number
  municipioId?: number
  marker: [number, number] | null
}

export default function LeafletMap({
  estadoGeojson, municipioGeojson, estadoId, municipioId, marker,
}: LeafletMapProps) {
  const activeGeojson = municipioGeojson ?? estadoGeojson

  return (
    <MapContainer
      center={[-15.77972, -47.92972]}
      zoom={4}
      style={{ height: '100%', width: '100%', position: 'absolute', inset: 0 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {estadoGeojson && !municipioGeojson && (
        <GeoJSON key={`estado-${estadoId}`} data={estadoGeojson} style={estadoStyle} />
      )}
      {municipioGeojson && (
        <GeoJSON key={`municipio-${municipioId}`} data={municipioGeojson} style={municipioStyle} />
      )}

      <FitAll geojson={activeGeojson} marker={marker} />
      {marker && <Marker position={marker} />}
    </MapContainer>
  )
}
