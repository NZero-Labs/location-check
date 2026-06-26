'use client'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import * as turf from '@turf/turf'
import type { Feature, Polygon, MultiPolygon } from 'geojson'

import { trpc } from '@/lib/trpc'
import type { Estado, Municipio } from '@/types'
import type { GeoResult } from '@/lib/geocoding'

import { MapView } from '@/components/MapView'
import { GeoSearch } from '@/components/GeoSearch'
import { ComboBox } from '@/components/ComboBox'

import {
  Sidebar, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarInset, SidebarProvider,
} from '@/components/ui/sidebar'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Loader2, Monitor, Moon, Sun, Share2, Check } from 'lucide-react'

// ── helpers ────────────────────────────────────────────────────────────────────

function pointInGeojson(geojson: GeoJSON.FeatureCollection, lat: number, lng: number) {
  const pt = turf.point([lng, lat])
  for (const f of geojson.features) {
    if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
      if (turf.booleanPointInPolygon(pt, f as Feature<Polygon | MultiPolygon>)) return true
  }
  return false
}

function extractMunicipioMalha(
  estadoGeojson: GeoJSON.FeatureCollection,
  municipioId: number
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: estadoGeojson.features.filter(
      (f) => f.properties?.codarea === String(municipioId)
    ),
  }
}

type CheckResult = { inside: boolean; label: string } | null

// ── Theme toggle ───────────────────────────────────────────────────────────────

const THEMES = [
  { value: 'light',  label: 'Claro',   icon: Sun },
  { value: 'dark',   label: 'Escuro',  icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
] as const

function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const active = THEMES.find((t) => t.value === theme) ?? THEMES[2]
  const Icon = resolvedTheme === 'dark' ? Moon : Sun

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
          <Icon className="h-4 w-4" />
          <span className="sr-only">Tema: {active.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {THEMES.map(({ value, label, icon: TIcon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className={theme === value ? 'bg-accent' : ''}
          >
            <TIcon className="mr-2 h-4 w-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Share button ───────────────────────────────────────────────────────────────

function ShareButton() {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="outline" size="sm" onClick={handleShare} className="gap-1.5">
      {copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
      {copied ? 'Copiado!' : 'Compartilhar'}
    </Button>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Page() {
  return (
    <Suspense>
      <PageInner />
    </Suspense>
  )
}

function PageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [selectedEstado, setSelectedEstado] = useState<Estado | null>(null)
  const [selectedMunicipio, setSelectedMunicipio] = useState<Municipio | null>(null)
  const [estadoOpen, setEstadoOpen] = useState(false)
  const [municipioOpen, setMunicipioOpen] = useState(false)
  const [municipioGeojson, setMunicipioGeojson] = useState<GeoJSON.FeatureCollection | null>(null)
  const [latInput, setLatInput] = useState(searchParams.get('lat') ?? '')
  const [lngInput, setLngInput] = useState(searchParams.get('lng') ?? '')
  const [markerPos, setMarkerPos] = useState<[number, number] | null>(null)
  const [checkResult, setCheckResult] = useState<CheckResult>(null)
  const [restored, setRestored] = useState(false)

  // ── tRPC queries ─────────────────────────────────────────────────────────────
  const { data: estados = [], isLoading: loadingEstados } = trpc.ibge.estados.useQuery()

  const { data: municipios = [], isLoading: loadingMunicipios } =
    trpc.ibge.municipios.useQuery(
      { estadoId: selectedEstado?.id ?? 0 },
      { enabled: !!selectedEstado }
    )

  const { data: estadoGeojson = null, isLoading: loadingMalha } =
    trpc.ibge.malhaEstado.useQuery(
      { estadoId: selectedEstado?.id ?? 0 },
      { enabled: !!selectedEstado }
    )

  // ── Restore state from URL params ─────────────────────────────────────────────
  useEffect(() => {
    if (restored || !estados.length) return
    const estadoId = searchParams.get('estadoId')
    const estadoSigla = searchParams.get('estado')
    if (!estadoId && !estadoSigla) { setRestored(true); return }

    const estado = estados.find(
      (e) => e.id === Number(estadoId) || e.sigla === estadoSigla
    )
    if (estado) {
      setSelectedEstado(estado)
      setRestored(true)
    }
  }, [estados, searchParams, restored])

  // Restore municipio after municipios load
  useEffect(() => {
    if (!restored || !municipios.length) return
    const munId = searchParams.get('municipioId')
    if (!munId) return
    const mun = municipios.find((m) => m.id === Number(munId))
    if (mun && estadoGeojson) {
      setSelectedMunicipio(mun)
      const filtered = extractMunicipioMalha(estadoGeojson as GeoJSON.FeatureCollection, mun.id)
      setMunicipioGeojson(filtered.features.length ? filtered : null)
    }
  }, [municipios, estadoGeojson, searchParams, restored])

  // ── Sync state → URL ──────────────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams()
    if (selectedEstado) {
      params.set('estado', selectedEstado.sigla)
      params.set('estadoId', String(selectedEstado.id))
    }
    if (selectedMunicipio) {
      params.set('municipio', selectedMunicipio.nome)
      params.set('municipioId', String(selectedMunicipio.id))
    }
    if (latInput) params.set('lat', latInput)
    if (lngInput) params.set('lng', lngInput)

    const search = params.toString()
    router.replace(search ? `?${search}` : '/', { scroll: false })
  }, [selectedEstado, selectedMunicipio, latInput, lngInput, router])

  // ── Handlers ──────────────────────────────────────────────────────────────────
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

  // ── Reactive coord → marker + check ──────────────────────────────────────────
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

  const { resolvedTheme } = useTheme()

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <SidebarProvider defaultOpen className="h-dvh overflow-hidden">
        <Sidebar variant="inset" collapsible="none">
          <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-sm leading-tight">Malhas IBGE</span>
                <span className="text-xs text-muted-foreground">Amara NetZero</span>
              </div>
              <ThemeToggle />
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 overflow-y-auto">
            {/* Localização */}
            <SidebarGroup>
              <SidebarGroupLabel>Localização</SidebarGroupLabel>
              <SidebarGroupContent className="flex flex-col gap-3 px-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Estado</Label>
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
                  <Label className="text-xs">Município</Label>
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
              </SidebarGroupContent>
            </SidebarGroup>

            <Separator />

            {/* Geo search */}
            <SidebarGroup>
              <SidebarGroupLabel>Busca de endereço</SidebarGroupLabel>
              <SidebarGroupContent className="px-2">
                <GeoSearch onResult={handleGeoResult} />
              </SidebarGroupContent>
            </SidebarGroup>

            <Separator />

            {/* Coordenada */}
            <SidebarGroup>
              <SidebarGroupLabel>Coordenada</SidebarGroupLabel>
              <SidebarGroupContent className="flex flex-col gap-3 px-2">
                <div className="flex gap-2">
                  <div className="flex flex-col gap-1.5 flex-1">
                    <Label htmlFor="lat" className="text-xs">Latitude</Label>
                    <Input
                      id="lat"
                      placeholder="-23.5505"
                      value={latInput}
                      onChange={(e) => setLatInput(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <Label htmlFor="lng" className="text-xs">Longitude</Label>
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
                    Ponto plotado. Selecione um estado para verificar.
                  </p>
                )}
                {validCoord && loadingMalha && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Verificando...
                  </p>
                )}
                {checkResult && (
                  <div className="flex flex-col gap-1">
                    <Badge
                      variant={checkResult.inside ? 'default' : 'destructive'}
                      className="text-xs py-1 justify-center"
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

                {/* Share */}
                {(selectedEstado || validCoord) && (
                  <ShareButton />
                )}
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border px-4 py-2">
            <p className="text-xs text-muted-foreground">
              IBGE · Nominatim · ViaCEP
            </p>
          </SidebarFooter>
        </Sidebar>

        {/* Map */}
        <SidebarInset className="relative min-w-0 h-dvh overflow-hidden">
          <MapView
            estadoGeojson={estadoGeojson as GeoJSON.FeatureCollection | null}
            municipioGeojson={municipioGeojson}
            estadoId={selectedEstado?.id}
            municipioId={selectedMunicipio?.id}
            marker={markerPos}
            theme={resolvedTheme}
          />
        </SidebarInset>
    </SidebarProvider>
  )
}
