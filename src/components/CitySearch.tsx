'use client'
import { useCallback, useRef, useState } from 'react'
import { trpc } from '@/lib/trpc'
import type { CitySearchValue, MunicipioWithEstado } from '@/types'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import {
  Command, CommandEmpty, CommandGroup,
  CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { Check, ChevronsUpDown, Loader2, Map as MapIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CitySearchProps {
  value: CitySearchValue | null
  onSelect: (v: CitySearchValue) => void
}

function triggerLabel(value: CitySearchValue | null): React.ReactNode {
  if (!value) return <span className="text-muted-foreground">Buscar estado ou município...</span>
  if (value.kind === 'estado') {
    return (
      <span>
        {value.data.nome}{' '}
        <span className="text-muted-foreground">({value.data.sigla}) — Estado</span>
      </span>
    )
  }
  return (
    <span>
      {value.data.nome}{' '}
      <span className="text-muted-foreground">({value.data.estadoSigla})</span>
    </span>
  )
}

export function CitySearch({ value, onSelect }: CitySearchProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleInput = useCallback((val: string) => {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), 300)
  }, [])

  const trimmed = debouncedQuery.trim()

  const { data: estadoResults = [], isFetching: fetchingEstados } =
    trpc.ibge.searchEstados.useQuery(
      { query: trimmed },
      { enabled: trimmed.length >= 1 }
    )

  const { data: municipioResults = [], isFetching: fetchingMunicipios } =
    trpc.ibge.searchMunicipios.useQuery(
      { query: trimmed, limit: 20 },
      { enabled: trimmed.length >= 2 }
    )

  const isFetching = fetchingEstados || fetchingMunicipios

  // Group municipios by state
  type GroupMap = Map<string, { estadoNome: string; items: MunicipioWithEstado[] }>
  const grouped: GroupMap = new Map()
  for (const m of municipioResults) {
    if (!grouped.has(m.estadoSigla)) grouped.set(m.estadoSigla, { estadoNome: m.estadoNome, items: [] })
    grouped.get(m.estadoSigla)!.items.push(m)
  }

  const hasResults = estadoResults.length > 0 || municipioResults.length > 0

  const close = () => { setOpen(false); setQuery(''); setDebouncedQuery('') }

  const selectedKey =
    value?.kind === 'estado' ? `estado-${value.data.id}`
    : value?.kind === 'municipio' ? `municipio-${value.data.id}`
    : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{triggerLabel(value)}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-88 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Estado ou município..."
            value={query}
            onValueChange={handleInput}
          />
          <CommandList>
            {isFetching && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {!isFetching && trimmed.length < 1 && (
              <div className="py-4 text-center text-xs text-muted-foreground">
                Digite para buscar um estado ou município
              </div>
            )}

            {!isFetching && trimmed.length >= 1 && !hasResults && (
              <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
            )}

            {/* ── Estados ── */}
            {!isFetching && estadoResults.length > 0 && (
              <>
                <CommandGroup heading="Estados">
                  {estadoResults.map((e) => {
                    const key = `estado-${e.id}`
                    return (
                      <CommandItem
                        key={key}
                        value={key}
                        onSelect={() => { onSelect({ kind: 'estado', data: e }); close() }}
                        className="gap-2"
                      >
                        <Check className={cn('h-4 w-4 shrink-0', selectedKey === key ? 'opacity-100' : 'opacity-0')} />
                        <MapIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{e.nome}</span>
                        <Badge variant="secondary" className="shrink-0 text-xs">{e.sigla}</Badge>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
                {municipioResults.length > 0 && <CommandSeparator />}
              </>
            )}

            {/* ── Municípios grouped by state ── */}
            {!isFetching && Array.from(grouped.entries()).map(([sigla, group], idx) => (
              <CommandGroup
                key={sigla}
                heading={`${group.estadoNome} (${sigla})`}
              >
                {group.items.map((m) => {
                  const key = `municipio-${m.id}`
                  return (
                    <CommandItem
                      key={key}
                      value={key}
                      onSelect={() => { onSelect({ kind: 'municipio', data: m }); close() }}
                    >
                      <Check className={cn('mr-2 h-4 w-4 shrink-0', selectedKey === key ? 'opacity-100' : 'opacity-0')} />
                      <span className="flex-1 truncate">{m.nome}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
