'use client'
import { useCallback, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Search, MapPin } from 'lucide-react'
import { searchByCep, searchByAddress, parseGoogleMapsUrl, type GeoResult } from '@/lib/geocoding'

const CEP_RE = /^\d{5}-?\d{3}$/

interface GeoSearchProps {
  onResult: (result: GeoResult) => void
}

export function GeoSearch({ onResult }: GeoSearchProps) {
  const [query, setQuery] = useState('')
  const [mapsUrl, setMapsUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [mapsError, setMapsError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<GeoResult[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isCep = CEP_RE.test(query.trim())

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) { setResults([]); setError(null); return }
    setLoading(true)
    setError(null)
    try {
      if (CEP_RE.test(trimmed)) {
        const r = await searchByCep(trimmed)
        onResult(r)
        setResults([])
        setQuery('')
      } else {
        const r = await searchByAddress(trimmed)
        setResults(r)
        if (!r.length) setError('Nenhum endereço encontrado')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [onResult])

  const handleQueryChange = useCallback((val: string) => {
    setQuery(val)
    setResults([])
    setError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    // Auto-search when CEP is complete; debounce for address
    if (CEP_RE.test(val.trim())) {
      debounceRef.current = setTimeout(() => runSearch(val), 400)
    } else if (val.trim().length >= 4) {
      debounceRef.current = setTimeout(() => runSearch(val), 600)
    }
  }, [runSearch])

  const handleMapsSubmit = useCallback(() => {
    setMapsError(null)
    const result = parseGoogleMapsUrl(mapsUrl.trim())
    if (!result) { setMapsError('Link inválido. Use um link do Google Maps com coordenadas.'); return }
    onResult(result)
    setMapsUrl('')
  }, [mapsUrl, onResult])

  return (
    <div className="flex flex-col gap-4">
      {/* Address / CEP */}
      <div className="flex flex-col gap-1.5">
        <div className="relative">
          <Input
            placeholder="CEP (00000-000) ou endereço completo"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch(query)}
            className="pr-9"
          />
          {loading
            ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground pointer-events-none" />
            : <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />}
        </div>
        {isCep && !loading && (
          <p className="text-xs text-muted-foreground">CEP detectado — buscando automaticamente...</p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {results.length > 0 && (
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
            {results.map((r, i) => (
              <button
                key={i}
                onClick={() => { onResult(r); setResults([]); setQuery('') }}
                className="text-left text-xs px-2 py-1.5 rounded-md hover:bg-muted transition-colors border border-transparent hover:border-border"
              >
                <span className="line-clamp-2 text-foreground">{r.displayName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Google Maps URL */}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3 w-3" /> Link do Google Maps
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="https://maps.google.com/..."
            value={mapsUrl}
            onChange={(e) => { setMapsUrl(e.target.value); setMapsError(null) }}
            onKeyDown={(e) => e.key === 'Enter' && handleMapsSubmit()}
            className="flex-1 text-xs"
          />
          <Button
            size="icon"
            variant="outline"
            onClick={handleMapsSubmit}
            disabled={!mapsUrl.trim()}
            title="Usar link"
          >
            <MapPin className="h-4 w-4" />
          </Button>
        </div>
        {mapsError && <p className="text-xs text-destructive">{mapsError}</p>}
      </div>
    </div>
  )
}
