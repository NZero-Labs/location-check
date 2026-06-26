/**
 * Pre-downloads IBGE estados, municipios and malhas geográficas
 * into public/data/ so the app can run fully offline without hitting
 * the government API at runtime.
 *
 * Run once:  npm run download
 * Or auto:   npm run build  (includes this as a pre-step)
 *
 * Files written:
 *   public/data/estados.json
 *   public/data/municipios/{estadoId}.json
 *   public/data/malhas/{estadoId}.geojson   (all municipalities as features)
 */

import fs from 'fs/promises'
import { existsSync, mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'public', 'data')
const IBGE = 'https://servicodados.ibge.gov.br/api'

// intermediaria balances file size vs polygon fidelity (good for PIP checks)
const MALHA_QUALITY = 'intermediaria'
const REQUEST_DELAY_MS = 350

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let ok = 0
let skip = 0
let fail = 0

async function download(url, label) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
  const ct = res.headers.get('content-type') ?? ''
  const data = ct.includes('json') ? await res.json() : await res.text()
  process.stdout.write(` ✓ ${label}\n`)
  ok++
  return data
}

async function saveIfMissing(file, fetchFn) {
  if (existsSync(file)) {
    skip++
    return false
  }
  const data = await fetchFn()
  await fs.writeFile(file, typeof data === 'string' ? data : JSON.stringify(data))
  await sleep(REQUEST_DELAY_MS)
  return true
}

async function main() {
  console.log('=== IBGE data downloader ===\n')

  mkdirSync(path.join(OUT, 'malhas'), { recursive: true })
  mkdirSync(path.join(OUT, 'municipios'), { recursive: true })

  // ── Estados ─────────────────────────────────────────────────────────────────
  const estadosFile = path.join(OUT, 'estados.json')
  let estados
  if (existsSync(estadosFile)) {
    estados = JSON.parse(await fs.readFile(estadosFile, 'utf8'))
    console.log(`estados.json already exists (${estados.length} estados) — skipping`)
    skip++
  } else {
    process.stdout.write('Downloading estados...')
    estados = await download(
      `${IBGE}/v1/localidades/estados?orderBy=nome`,
      `${estados?.length ?? '?'} estados`
    )
    await fs.writeFile(estadosFile, JSON.stringify(estados))
    await sleep(REQUEST_DELAY_MS)
  }

  // ── Per-state: municipios + malha ───────────────────────────────────────────
  const total = estados.length
  for (let i = 0; i < total; i++) {
    const e = estados[i]
    const prefix = `[${String(i + 1).padStart(2, '0')}/${total}] ${e.nome} (${e.sigla})`
    console.log(prefix)

    // Municipalities list
    const munFile = path.join(OUT, 'municipios', `${e.id}.json`)
    const munFetched = await saveIfMissing(munFile, async () => {
      process.stdout.write('  municipios...')
      return download(
        `${IBGE}/v1/localidades/estados/${e.id}/municipios?orderBy=nome`,
        'ok'
      )
    })
    if (!munFetched) process.stdout.write('  municipios: cached\n')

    // State malha with all municipalities as sub-features
    const malhaFile = path.join(OUT, 'malhas', `${e.id}.geojson`)
    const malhaFetched = await saveIfMissing(malhaFile, async () => {
      process.stdout.write('  malha...')
      return download(
        `${IBGE}/v3/malhas/estados/${e.id}?intrarregiao=municipio&qualidade=${MALHA_QUALITY}&formato=application/vnd.geo+json`,
        'ok'
      )
    })
    if (!malhaFetched) process.stdout.write('  malha: cached\n')
  }

  console.log(`\n✅ Done — downloaded: ${ok}, skipped (cached): ${skip}, errors: ${fail}`)
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err.message)
  process.exit(1)
})
