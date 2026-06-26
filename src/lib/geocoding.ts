export interface GeoResult {
  lat: number
  lng: number
  displayName: string
  type?: string
}

export interface CepInfo {
  cep: string
  logradouro: string
  bairro: string
  localidade: string
  uf: string
  erro?: boolean
}

const NOMINATIM = 'https://nominatim.openstreetmap.org'
const VIA_CEP = 'https://viacep.com.br/ws'

function nominatimHeaders(): HeadersInit {
  return { 'Accept-Language': 'pt-BR,pt;q=0.9' }
}

function parseNominatimResults(items: NominatimItem[]): GeoResult[] {
  return items.map((item) => ({
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    displayName: item.display_name,
    type: item.type,
  }))
}

interface NominatimItem {
  lat: string
  lon: string
  display_name: string
  type?: string
}

export async function searchByCep(cep: string): Promise<GeoResult> {
  const clean = cep.replace(/\D/g, '')
  if (clean.length !== 8) throw new Error('CEP deve conter 8 dígitos')

  const res = await fetch(`${VIA_CEP}/${clean}/json/`)
  if (!res.ok) throw new Error('Erro ao consultar o ViaCEP')
  const data: CepInfo = await res.json()
  if (data.erro) throw new Error('CEP não encontrado')

  // Try geocoding with full address first, fall back to postal code only
  const fullAddress = [data.logradouro, data.bairro, data.localidade, data.uf, 'Brasil']
    .filter(Boolean)
    .join(', ')

  const results = await searchByAddress(fullAddress)
  if (results.length) return results[0]

  // Fallback: search by postal code
  const url = new URL(`${NOMINATIM}/search`)
  url.searchParams.set('postalcode', clean)
  url.searchParams.set('country', 'BR')
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  const fallbackRes = await fetch(url.toString(), { headers: nominatimHeaders() })
  const fallbackData: NominatimItem[] = await fallbackRes.json()
  if (!fallbackData.length) throw new Error('Não foi possível geocodificar o CEP')
  return parseNominatimResults(fallbackData)[0]
}

export interface ReverseGeoResult {
  stateSigla: string
  cityName: string
}

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeoResult | null> {
  const url = new URL(`${NOMINATIM}/reverse`)
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  url.searchParams.set('format', 'json')
  url.searchParams.set('addressdetails', '1')

  const res = await fetch(url.toString(), { headers: nominatimHeaders() })
  if (!res.ok) return null

  const data = await res.json()
  const address = data.address
  if (!address) return null

  // ISO3166-2-lvl4 is "BR-SP", extract the sigla
  const iso = address['ISO3166-2-lvl4'] as string | undefined
  const stateSigla = iso?.split('-')[1]
  const cityName: string | undefined =
    address.city ?? address.town ?? address.municipality ?? address.village ?? address.county

  if (!stateSigla || !cityName) return null
  return { stateSigla, cityName }
}

export function parseGoogleMapsUrl(input: string): GeoResult | null {
  // @lat,lng pattern (most Google Maps share URLs)
  const atMatch = input.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/)
  if (atMatch) {
    const lat = parseFloat(atMatch[1])
    const lng = parseFloat(atMatch[2])
    if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng, displayName: `${lat}, ${lng}` }
    }
  }
  // q=lat,lng pattern
  try {
    const url = new URL(input)
    if (url.hostname.includes('google') || url.hostname.includes('goo.gl')) {
      const q = url.searchParams.get('q')
      if (q) {
        const parts = q.split(',')
        if (parts.length >= 2) {
          const lat = parseFloat(parts[0].trim())
          const lng = parseFloat(parts[1].trim())
          if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
            return { lat, lng, displayName: `${lat}, ${lng}` }
          }
        }
      }
    }
  } catch {}
  return null
}

export async function searchByAddress(query: string): Promise<GeoResult[]> {
  if (!query.trim()) return []
  const url = new URL(`${NOMINATIM}/search`)
  url.searchParams.set('q', query)
  url.searchParams.set('countrycodes', 'br')
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '6')
  url.searchParams.set('addressdetails', '0')
  const res = await fetch(url.toString(), { headers: nominatimHeaders() })
  if (!res.ok) throw new Error('Erro ao consultar o Nominatim')
  const data: NominatimItem[] = await res.json()
  return parseNominatimResults(data)
}
