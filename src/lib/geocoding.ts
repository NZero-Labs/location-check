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
