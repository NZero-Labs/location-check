import dynamic from 'next/dynamic'
import type { LeafletMapProps } from './LeafletMap'

// Leaflet requires `window` — must never run on the server
const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-muted text-muted-foreground text-sm">
      Carregando mapa...
    </div>
  ),
})

export { LeafletMap as MapView }
export type { LeafletMapProps }
