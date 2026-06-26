'use client'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import * as turf from '@turf/turf'
import type { Feature, Polygon, MultiPolygon } from 'geojson'

import { trpc } from '@/lib/trpc'
import type { CitySearchValue, Estado, MunicipioWithEstado } from '@/types'
import type { GeoResult } from '@/lib/geocoding'
import { reverseGeocode } from '@/lib/geocoding'

import { MapView } from '@/components/MapView'
import { GeoSearch } from '@/components/GeoSearch'
import { CitySearch } from '@/components/CitySearch'

import {
  Sidebar, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarInset, SidebarProvider,
} from '@/components/ui/sidebar'
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
  const [selectedMunicipio, setSelectedMunicipio] = useState<MunicipioWithEstado | null>(null)
  const [municipioGeojson, setMunicipioGeojson] = useState<GeoJSON.FeatureCollection | null>(null)
  const [latInput, setLatInput] = useState(searchParams.get('lat') ?? '')
  const [lngInput, setLngInput] = useState(searchParams.get('lng') ?? '')
  const [markerPos, setMarkerPos] = useState<[number, number] | null>(null)
  const [checkResult, setCheckResult] = useState<CheckResult>(null)
  const [restored, setRestored] = useState(false)
  const [detectedMunicipio, setDetectedMunicipio] = useState<MunicipioWithEstado | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [revGeoQuery, setRevGeoQuery] = useState<{ name: string; sigla: string } | null>(null)
  const reverseGeocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── tRPC queries ─────────────────────────────────────────────────────────────

  // Restore from URL: fetch municipio by ID
  const munIdFromUrl = restored ? null : Number(searchParams.get('municipioId')) || null
  const { data: restoredMun } = trpc.ibge.getMunicipio.useQuery(
    { id: munIdFromUrl ?? 0 },
    { enabled: !!munIdFromUrl && !restored }
  )

  // Malha for selected municipio (server extracts only the one feature)
  const { data: municipioMalha = null, isLoading: loadingMalhaMunicipio } =
    trpc.ibge.malhaMunicipio.useQuery(
      { municipioId: selectedMunicipio?.id ?? 0, estadoId: selectedMunicipio?.estadoId ?? 0 },
      { enabled: !!selectedMunicipio }
    )

  // Malha for selected estado
  const { data: estadoMalha = null, isLoading: loadingMalhaEstado } =
    trpc.ibge.malhaEstado.useQuery(
      { estadoId: selectedEstado?.id ?? 0 },
      { enabled: !!selectedEstado && !selectedMunicipio }
    )

  const loadingMalha = loadingMalhaMunicipio || loadingMalhaEstado
  const activeMalha = municipioMalha ?? estadoMalha ?? null

  // Reverse geocode city search
  const { data: revGeoResults = [] } = trpc.ibge.searchMunicipios.useQuery(
    { query: revGeoQuery?.name ?? '', limit: 20 },
    { enabled: !!revGeoQuery }
  )

  // Malha for detected municipio (only when different from selected)
  const { data: detectedMalha = null } = trpc.ibge.malhaMunicipio.useQuery(
    { municipioId: detectedMunicipio?.id ?? 0, estadoId: detectedMunicipio?.estadoId ?? 0 },
    { enabled: !!detectedMunicipio && detectedMunicipio.id !== selectedMunicipio?.id }
  )

  // ── Restore from URL ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (restored || !restoredMun) return
    setSelectedMunicipio(restoredMun)
    setRestored(true)
  }, [restoredMun, restored])

  useEffect(() => {
    if (restored) return
    if (!munIdFromUrl) setRestored(true)
  }, [munIdFromUrl, restored])

  // ── Sync municipioGeojson when malha loads ────────────────────────────────────
  useEffect(() => {
    setMunicipioGeojson(activeMalha)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipioMalha, estadoMalha])

  // ── Sync state → URL ──────────────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams()
    if (selectedMunicipio) {
      params.set('municipio', selectedMunicipio.nome)
      params.set('municipioId', String(selectedMunicipio.id))
      params.set('estado', selectedMunicipio.estadoSigla)
      params.set('estadoId', String(selectedMunicipio.estadoId))
    } else if (selectedEstado) {
      params.set('estado', selectedEstado.sigla)
      params.set('estadoId', String(selectedEstado.id))
    }
    if (latInput) params.set('lat', latInput)
    if (lngInput) params.set('lng', lngInput)

    const search = params.toString()
    router.replace(search ? `?${search}` : '/', { scroll: false })
  }, [selectedEstado, selectedMunicipio, latInput, lngInput, router])

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleCitySearchSelect = useCallback((v: CitySearchValue) => {
    if (v.kind === 'estado') {
      setSelectedEstado(v.data)
      setSelectedMunicipio(null)
    } else {
      setSelectedEstado(null)
      setSelectedMunicipio(v.data)
    }
    setDetectedMunicipio(null)
    setCheckResult(null)
  }, [])

  const handleUseDetected = useCallback(() => {
    if (!detectedMunicipio) return
    setSelectedEstado(null)
    setSelectedMunicipio(detectedMunicipio)
    setDetectedMunicipio(null)
    setCheckResult(null)
  }, [detectedMunicipio])

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
    if (!municipioGeojson || loadingMalha) { setCheckResult(null); return }
    const inside = pointInGeojson(municipioGeojson, lat, lng)
    const label = selectedMunicipio?.nome ?? selectedEstado?.nome ?? ''
    setCheckResult({ inside, label })
  }, [lat, lng, validCoord, municipioGeojson, loadingMalha, selectedMunicipio, selectedEstado])

  // ── Auto-detect municipio from coordinates ────────────────────────────────────
  useEffect(() => {
    if (!validCoord || lat === null || lng === null) {
      setDetectedMunicipio(null)
      return
    }
    if (reverseGeocodeTimer.current) clearTimeout(reverseGeocodeTimer.current)
    reverseGeocodeTimer.current = setTimeout(async () => {
      setIsLocating(true)
      setDetectedMunicipio(null)
      try {
        const result = await reverseGeocode(lat, lng)
        if (result) setRevGeoQuery({ name: result.cityName, sigla: result.stateSigla })
      } finally {
        setIsLocating(false)
      }
    }, 900)
    return () => { if (reverseGeocodeTimer.current) clearTimeout(reverseGeocodeTimer.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, validCoord])

  // ── Handle reverse geocode results — never change the user's selection ────────
  useEffect(() => {
    if (!revGeoQuery || !revGeoResults.length) return
    const match = revGeoResults.find((m) => m.estadoSigla === revGeoQuery.sigla)
    if (!match) return
    setRevGeoQuery(null)
    // Only show as secondary layer; never overwrite what the user selected
    if (match.id !== selectedMunicipio?.id) {
      setDetectedMunicipio(match)
    } else {
      setDetectedMunicipio(null)
    }
  }, [revGeoResults, revGeoQuery, selectedMunicipio])

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
            {/* Município */}
            <SidebarGroup>
              <SidebarGroupLabel>Localização</SidebarGroupLabel>
              <SidebarGroupContent className="flex flex-col gap-2 px-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Estado ou município</Label>
                  <CitySearch
                    value={
                      selectedMunicipio
                        ? { kind: 'municipio', data: selectedMunicipio }
                        : selectedEstado
                          ? { kind: 'estado', data: selectedEstado }
                          : null
                    }
                    onSelect={handleCitySearchSelect}
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

                {isLocating && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Identificando localização...
                  </p>
                )}
                {validCoord && !checkResult && !loadingMalha && !selectedMunicipio && !selectedEstado && !isLocating && (
                  <p className="text-xs text-muted-foreground">
                    Ponto plotado. Selecione um estado ou município para verificar.
                  </p>
                )}
                {validCoord && loadingMalha && !isLocating && (
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

                {/* Detected municipio differs from selected */}
                {detectedMunicipio && selectedMunicipio && detectedMunicipio.id !== selectedMunicipio.id && (
                  <div className="flex flex-col gap-2 rounded-md border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 p-3">
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">Ponto localizado em:</p>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Badge variant="outline" className="text-xs shrink-0 border-indigo-300 dark:border-indigo-700">
                          {detectedMunicipio.estadoSigla}
                        </Badge>
                        <span className="text-sm font-medium truncate">{detectedMunicipio.nome}</span>
                      </div>
                      <Button size="sm" variant="outline" className="shrink-0 text-xs h-7" onClick={handleUseDetected}>
                        Usar
                      </Button>
                    </div>
                  </div>
                )}

                {/* Share */}
                {(selectedMunicipio || selectedEstado || validCoord) && (
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
            estadoGeojson={null}
            municipioGeojson={municipioGeojson}
            municipioId={selectedMunicipio?.id}
            detectedMunicipioGeojson={detectedMalha ?? null}
            detectedMunicipioId={detectedMunicipio?.id}
            marker={markerPos}
            theme={resolvedTheme}
          />

          {/* Map legend */}
          {(municipioGeojson || detectedMalha) && (
            <div className="absolute bottom-6 right-3 z-1200 flex flex-col gap-1.5 rounded-lg border border-border bg-background/90 backdrop-blur-sm px-3 py-2 shadow-md text-xs">
              {municipioGeojson && selectedMunicipio && (
                <div className="flex items-center gap-2">
                  <span className="h-3 w-5 shrink-0 rounded-sm border-2 border-emerald-500 bg-emerald-200/60" />
                  <span className="font-medium truncate max-w-40">
                    {selectedMunicipio.nome}
                    <span className="text-muted-foreground font-normal"> ({selectedMunicipio.estadoSigla})</span>
                  </span>
                </div>
              )}
              {municipioGeojson && selectedEstado && !selectedMunicipio && (
                <div className="flex items-center gap-2">
                  <span className="h-3 w-5 shrink-0 rounded-sm border-2 border-emerald-500 bg-emerald-200/60" />
                  <span className="font-medium truncate max-w-40">
                    {selectedEstado.nome}
                    <span className="text-muted-foreground font-normal"> ({selectedEstado.sigla})</span>
                  </span>
                </div>
              )}
              {detectedMalha && detectedMunicipio && (
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-5 shrink-0 rounded-sm border-2 border-indigo-500 bg-indigo-200/60"
                    style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(99,102,241,0.3) 3px, rgba(99,102,241,0.3) 6px)' }}
                  />
                  <span className="truncate max-w-40">
                    {detectedMunicipio.nome}
                    <span className="text-muted-foreground"> ({detectedMunicipio.estadoSigla})</span>
                  </span>
                </div>
              )}
            </div>
          )}
        </SidebarInset>
    </SidebarProvider>
  )
}
