'use client'
import { useCallback, useRef, useState } from 'react'
import { trpc } from '@/lib/trpc'
import type { MunicipioWithEstado } from '@/types'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import {
  Command, CommandEmpty, CommandGroup,
  CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CitySearchProps {
  value: MunicipioWithEstado | null
  onSelect: (m: MunicipioWithEstado) => void
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

  const { data: results = [], isFetching } = trpc.ibge.searchMunicipios.useQuery(
    { query: debouncedQuery, limit: 12 },
    { enabled: debouncedQuery.trim().length >= 2 }
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {value
              ? <span>{value.nome} <span className="text-muted-foreground">({value.estadoSigla})</span></span>
              : <span className="text-muted-foreground">Buscar município...</span>}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Digite o nome do município..."
            value={query}
            onValueChange={handleInput}
          />
          <CommandList>
            {isFetching && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!isFetching && debouncedQuery.trim().length < 2 && (
              <div className="py-4 text-center text-xs text-muted-foreground">
                Digite ao menos 2 caracteres
              </div>
            )}
            {!isFetching && debouncedQuery.trim().length >= 2 && results.length === 0 && (
              <CommandEmpty>Nenhum município encontrado.</CommandEmpty>
            )}
            {!isFetching && results.length > 0 && (
              <CommandGroup>
                {results.map((m) => (
                  <CommandItem
                    key={m.id}
                    value={String(m.id)}
                    onSelect={() => {
                      onSelect(m)
                      setOpen(false)
                      setQuery('')
                      setDebouncedQuery('')
                    }}
                  >
                    <Check
                      className={cn('mr-2 h-4 w-4 shrink-0',
                        value?.id === m.id ? 'opacity-100' : 'opacity-0')}
                    />
                    <span className="flex-1 truncate">{m.nome}</span>
                    <Badge variant="outline" className="ml-2 shrink-0 text-xs font-normal">
                      {m.estadoSigla}
                    </Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
