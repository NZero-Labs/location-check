'use client'
import { useCallback, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Loader2, MapPin, Search } from 'lucide-react'
import { searchByCep, searchByAddress, type GeoResult } from '@/lib/geocoding'

type GeoMode = 'cep' | 'address'

interface GeoSearchProps {
  onResult: (result: GeoResult) => void
}

export function GeoSearch({ onResult }: GeoSearchProps) {
  const [mode, setMode] = useState<GeoMode>('cep')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<GeoResult[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearch = useCallback(async (q: string, m: GeoMode) => {
    if (!q.trim()) { setResults([]); setError(null); return }
    if (m === 'cep' && q.replace(/\D/g, '').length !== 8) return
    setLoading(true)
    setError(null)
    try {
      if (m === 'cep') {
        const r = await searchByCep(q)
        onResult(r)
        setResults([])
        setQuery('')
      } else {
        const r = await searchByAddress(q)
        setResults(r)
        if (!r.length) setError('Nenhum endereço encontrado')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [onResult])

  const handleAddressChange = useCallback((val: string) => {
    setQuery(val)
    setResults([])
    setError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => handleSearch(val, 'address'), 600)
  }, [handleSearch])

  const switchMode = (m: GeoMode) => {
    setMode(m); setQuery(''); setResults([]); setError(null)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5" />
          Busca de endereço
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex rounded-md border border-border overflow-hidden text-xs font-medium">
          {(['cep', 'address'] as GeoMode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={cn(
                'flex-1 py-1.5 transition-colors',
                mode === m
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              )}
            >
              {m === 'cep' ? 'CEP' : 'Endereço'}
            </button>
          ))}
        </div>

        {mode === 'cep' ? (
          <div className="flex gap-2">
            <Input
              placeholder="00000-000"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(query, 'cep')}
              maxLength={9}
              className="flex-1"
            />
            <Button
              size="icon"
              onClick={() => handleSearch(query, 'cep')}
              disabled={loading || query.replace(/\D/g, '').length !== 8}
            >
              {loading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Search className="h-4 w-4" />}
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Input
              placeholder="Ex: Av. Paulista, São Paulo"
              value={query}
              onChange={(e) => handleAddressChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(query, 'address')}
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
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
      </CardContent>
    </Card>
  )
}
