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
  geojsons,
  marker,
}: {
  geojsons: (GeoJSON.FeatureCollection | null | undefined)[]
  marker: [number, number] | null
}) {
  const map = useMap()
  useEffect(() => {
    try {
      const active = geojsons.filter(Boolean) as GeoJSON.FeatureCollection[]
      let bounds: L.LatLngBounds | null = null

      for (const g of active) {
        const layer = L.geoJSON(g)
        const b = layer.getBounds()
        if (!b.isValid()) continue
        bounds = bounds ? bounds.extend(b) : b
      }

      if (marker) {
        bounds = bounds ? bounds.extend(marker) : L.latLngBounds([marker, marker])
      }

      if (bounds && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...geojsons, marker, map])
  return null
}

const municipioStyle: L.PathOptions = {
  color: '#10b981', weight: 2, fillColor: '#6ee7b7', fillOpacity: 0.3,
}
const detectedStyle: L.PathOptions = {
  color: '#6366f1', weight: 2, fillColor: '#a5b4fc', fillOpacity: 0.25, dashArray: '6 4',
}

const TILE_LAYERS = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  light: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
}

export interface LeafletMapProps {
  estadoGeojson: GeoJSON.FeatureCollection | null
  municipioGeojson: GeoJSON.FeatureCollection | null
  estadoId?: number
  municipioId?: number
  detectedMunicipioGeojson?: GeoJSON.FeatureCollection | null
  detectedMunicipioId?: number
  marker: [number, number] | null
  theme?: string
}

export default function LeafletMap({
  municipioGeojson, municipioId,
  detectedMunicipioGeojson, detectedMunicipioId,
  marker, theme,
}: LeafletMapProps) {
  const tile = theme === 'dark' ? TILE_LAYERS.dark : TILE_LAYERS.light

  return (
    <MapContainer
      center={[-15.77972, -47.92972]}
      zoom={4}
      style={{ height: '100%', width: '100%', position: 'absolute', inset: 0 }}
    >
      <TileLayer
        key={theme}
        attribution={tile.attribution}
        url={tile.url}
      />

      {detectedMunicipioGeojson && (
        <GeoJSON
          key={`detected-${detectedMunicipioId}`}
          data={detectedMunicipioGeojson}
          style={detectedStyle}
        />
      )}
      {municipioGeojson && (
        <GeoJSON key={`municipio-${municipioId}`} data={municipioGeojson} style={municipioStyle} />
      )}

      <FitAll geojsons={[municipioGeojson, detectedMunicipioGeojson]} marker={marker} />
      {marker && <Marker position={marker} />}
    </MapContainer>
  )
}
