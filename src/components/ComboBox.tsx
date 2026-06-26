'use client'
import { Button } from '@/components/ui/button'
import {
  Command, CommandEmpty, CommandGroup,
  CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { Check, ChevronsUpDown } from 'lucide-react'

interface ComboBoxProps<T> {
  items: T[]
  value: T | null
  onSelect: (item: T) => void
  disabled?: boolean
  loading?: boolean
  placeholder: string
  disabledPlaceholder?: string
  getKey: (item: T) => string
  getLabel: (item: T) => string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ComboBox<T>({
  items, value, onSelect, disabled, loading,
  placeholder, disabledPlaceholder,
  getKey, getLabel, open, onOpenChange,
}: ComboBoxProps<T>) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {loading ? 'Carregando...'
              : value ? getLabel(value)
              : disabled && disabledPlaceholder ? disabledPlaceholder
              : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={getKey(item)}
                  value={getLabel(item)}
                  onSelect={() => { onSelect(item); onOpenChange(false) }}
                >
                  <Check className={cn('mr-2 h-4 w-4',
                    value && getKey(value) === getKey(item) ? 'opacity-100' : 'opacity-0')} />
                  {getLabel(item)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
