'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as turf from '@turf/turf'
import type { Feature, Polygon, MultiPolygon } from 'geojson'

import { trpc } from '@/lib/trpc'
import type { Estado, Municipio } from '@/types'
import type { GeoResult } from '@/lib/geocoding'

import { MapView } from '@/components/MapView'
import { GeoSearch } from '@/components/GeoSearch'
import { ComboBox } from '@/components/ComboBox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'

// ── helpers ────────────────────────────────────────────────────────────────────

function pointInGeojson(geojson: GeoJSON.FeatureCollection, lat: number, lng: number) {
  const pt = turf.point([lng, lat])
  for (const f of geojson.features) {
    if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
      if (turf.booleanPointInPolygon(pt, f as Feature<Polygon | MultiPolygon>)) return true
    }
  }
  return false
}

function extractMunicipioMalha(
  estadoGeojson: GeoJSON.FeatureCollection,
  municipioId: number
): GeoJSON.FeatureCollection {
  const code = String(municipioId)
  return {
    type: 'FeatureCollection',
    features: estadoGeojson.features.filter((f) => f.properties?.codarea === code),
  }
}

type CheckResult = { inside: boolean; label: string } | null

// ── page ───────────────────────────────────────────────────────────────────────

export default function Page() {
  const [selectedEstado, setSelectedEstado] = useState<Estado | null>(null)
  const [selectedMunicipio, setSelectedMunicipio] = useState<Municipio | null>(null)
  const [estadoOpen, setEstadoOpen] = useState(false)
  const [municipioOpen, setMunicipioOpen] = useState(false)
  const [municipioGeojson, setMunicipioGeojson] = useState<GeoJSON.FeatureCollection | null>(null)
  const [latInput, setLatInput] = useState('')
  const [lngInput, setLngInput] = useState('')
  const [markerPos, setMarkerPos] = useState<[number, number] | null>(null)
  const [checkResult, setCheckResult] = useState<CheckResult>(null)

  // ── tRPC queries ─────────────────────────────────────────────────────────────
  const { data: estados = [], isLoading: loadingEstados } = trpc.ibge.estados.useQuery()

  const { data: municipios = [], isLoading: loadingMunicipios } = trpc.ibge.municipios.useQuery(
    { estadoId: selectedEstado?.id ?? 0 },
    { enabled: !!selectedEstado }
  )

  const { data: estadoGeojson = null, isLoading: loadingMalha } = trpc.ibge.malhaEstado.useQuery(
    { estadoId: selectedEstado?.id ?? 0 },
    { enabled: !!selectedEstado }
  )

  // ── handlers ─────────────────────────────────────────────────────────────────
  const handleEstadoSelect = useCallback((estado: Estado) => {
    setSelectedEstado(estado)
    setSelectedMunicipio(null)
    setMunicipioGeojson(null)
    setCheckResult(null)
  }, [])

  const handleMunicipioSelect = useCallback(
    (mun: Municipio) => {
      setSelectedMunicipio(mun)
      setCheckResult(null)
      if (!estadoGeojson) return
      const filtered = extractMunicipioMalha(estadoGeojson as GeoJSON.FeatureCollection, mun.id)
      setMunicipioGeojson(filtered.features.length ? filtered : null)
    },
    [estadoGeojson]
  )

  const handleGeoResult = useCallback((r: GeoResult) => {
    setLatInput(String(r.lat))
    setLngInput(String(r.lng))
  }, [])

  // ── reactive coord → marker + check ──────────────────────────────────────────
  const lat = useMemo(() => { const v = parseFloat(latInput); return isNaN(v) ? null : v }, [latInput])
  const lng = useMemo(() => { const v = parseFloat(lngInput); return isNaN(v) ? null : v }, [lngInput])
  const validCoord = lat !== null && lng !== null

  useEffect(() => {
    if (!validCoord || lat === null || lng === null) {
      setMarkerPos(null); setCheckResult(null); return
    }
    setMarkerPos([lat, lng])
    const geojson = municipioGeojson ?? (estadoGeojson as GeoJSON.FeatureCollection | null)
    if (!geojson || loadingMalha) { setCheckResult(null); return }
    const inside = pointInGeojson(geojson, lat, lng)
    const label = selectedMunicipio?.nome ?? selectedEstado?.nome ?? ''
    setCheckResult({ inside, label })
  }, [lat, lng, validCoord, municipioGeojson, estadoGeojson, loadingMalha, selectedMunicipio, selectedEstado])

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-80 flex-shrink-0 flex flex-col gap-4 p-4 border-r border-border overflow-y-auto">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Malhas IBGE</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visualize e verifique coordenadas nos municípios brasileiros
          </p>
        </div>

        {/* Localização */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Localização</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Estado</Label>
              <ComboBox
                items={estados}
                value={selectedEstado}
                onSelect={handleEstadoSelect}
                loading={loadingEstados}
                placeholder="Buscar estado..."
                getKey={(e) => e.sigla}
                getLabel={(e) => `${e.nome} (${e.sigla})`}
                open={estadoOpen}
                onOpenChange={setEstadoOpen}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Município</Label>
              <ComboBox
                items={municipios}
                value={selectedMunicipio}
                onSelect={handleMunicipioSelect}
                disabled={!selectedEstado}
                loading={loadingMunicipios}
                placeholder="Buscar município..."
                disabledPlaceholder="Selecione o estado primeiro"
                getKey={(m) => String(m.id)}
                getLabel={(m) => m.nome}
                open={municipioOpen}
                onOpenChange={setMunicipioOpen}
              />
            </div>
            {loadingMalha && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Carregando malha...
              </p>
            )}
          </CardContent>
        </Card>

        {/* Geo search */}
        <GeoSearch onResult={handleGeoResult} />

        {/* Coordenada */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Coordenada</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex gap-2">
              <div className="flex flex-col gap-1.5 flex-1">
                <Label htmlFor="lat">Latitude</Label>
                <Input
                  id="lat"
                  placeholder="-23.5505"
                  value={latInput}
                  onChange={(e) => setLatInput(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <Label htmlFor="lng">Longitude</Label>
                <Input
                  id="lng"
                  placeholder="-46.6333"
                  value={lngInput}
                  onChange={(e) => setLngInput(e.target.value)}
                />
              </div>
            </div>

            {validCoord && !checkResult && !loadingMalha && !selectedEstado && (
              <p className="text-xs text-muted-foreground">
                Ponto plotado. Selecione um estado ou município para verificar.
              </p>
            )}
            {validCoord && loadingMalha && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Verificando ponto...
              </p>
            )}
            {checkResult && (
              <div className="flex flex-col gap-1">
                <Badge
                  variant={checkResult.inside ? 'default' : 'destructive'}
                  className="text-sm py-1 justify-center"
                >
                  {checkResult.inside
                    ? `Dentro de ${checkResult.label}`
                    : `Fora de ${checkResult.label}`}
                </Badge>
                {markerPos && (
                  <p className="text-xs text-muted-foreground text-center">
                    {markerPos[0].toFixed(6)}, {markerPos[1].toFixed(6)}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-xs text-muted-foreground mt-auto pt-2 border-t border-border">
          Dados: IBGE · Geocodificação: Nominatim / ViaCEP
        </div>
      </aside>

      {/* Map */}
      <main className="flex-1 relative">
        <MapView
          estadoGeojson={estadoGeojson as GeoJSON.FeatureCollection | null}
          municipioGeojson={municipioGeojson}
          estadoId={selectedEstado?.id}
          municipioId={selectedMunicipio?.id}
          marker={markerPos}
        />
      </main>
    </div>
  )
}
