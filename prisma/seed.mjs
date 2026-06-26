/**
 * Prisma seed — fetches IBGE data and upserts into the database.
 *
 *   npm run db:seed     → skip records that already exist
 *   npm run db:update   → force re-fetch and update everything
 *   npx prisma db seed  → same as db:seed
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import fs from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

// Load .env
const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env')
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf8').split('\n')
  for (const line of lines) {
    const [key, ...rest] = line.split('=')
    if (key?.trim() && rest.length && !process.env[key.trim()])
      process.env[key.trim()] = rest.join('=').trim()
  }
}

if (!process.env.DATABASE_URL) {
  console.error('❌  DATABASE_URL is not set. Create a .env file based on .env.example')
  process.exit(1)
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })
const IBGE = 'https://servicodados.ibge.gov.br/api'
const MALHA_QUALITY = 'maxima'
const DELAY_MS = 350
const forceUpdate = process.argv.includes('--force')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchJSON(url, label) {
  process.stdout.write(`  ↓ ${label}...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
  const data = await res.json()
  process.stdout.write(' ✓\n')
  return data
}

async function main() {
  const mode = forceUpdate ? 'UPDATE (force)' : 'SEED (skip existing)'
  console.log(`\n=== IBGE Prisma Seed  [${mode}] ===\n`)

  // ── Estados ──────────────────────────────────────────────────────────────────
  const estados = await fetchJSON(`${IBGE}/v1/localidades/estados?orderBy=nome`, 'estados')

  await Promise.all(
    estados.map((e) =>
      prisma.estado.upsert({
        where: { id: e.id },
        create: {
          id: e.id,
          sigla: e.sigla,
          nome: e.nome,
          regiaoId: e.regiao.id,
          regiaoSigla: e.regiao.sigla,
          regiaoNome: e.regiao.nome,
        },
        update: {
          sigla: e.sigla,
          nome: e.nome,
          regiaoId: e.regiao.id,
          regiaoSigla: e.regiao.sigla,
          regiaoNome: e.regiao.nome,
          updatedAt: new Date(),
        },
      })
    )
  )
  console.log(`✓ ${estados.length} estados upserted\n`)

  // ── Per-state: municipios + malha ─────────────────────────────────────────────
  for (let i = 0; i < estados.length; i++) {
    const e = estados[i]
    console.log(`[${String(i + 1).padStart(2, '0')}/${estados.length}] ${e.nome} (${e.sigla})`)

    // Municipalities
    const muns = await fetchJSON(
      `${IBGE}/v1/localidades/estados/${e.id}/municipios?orderBy=nome`,
      'municipios'
    )
    await Promise.all(
      muns.map((m) =>
        prisma.municipio.upsert({
          where: { id: m.id },
          create: { id: m.id, nome: m.nome, estadoId: e.id },
          update: { nome: m.nome, updatedAt: new Date() },
        })
      )
    )
    await sleep(DELAY_MS)

    // Malha — skip if already seeded (unless --force)
    const existingMalha = forceUpdate
      ? null
      : await prisma.malhaEstado.findUnique({ where: { estadoId: e.id }, select: { estadoId: true } })

    if (!existingMalha) {
      const malha = await fetchJSON(
        `${IBGE}/v3/malhas/estados/${e.id}?intrarregiao=municipio&qualidade=${MALHA_QUALITY}&formato=application/vnd.geo+json`,
        `malha (${MALHA_QUALITY})`
      )
      await prisma.malhaEstado.upsert({
        where: { estadoId: e.id },
        create: { estadoId: e.id, geojson: malha },
        update: { geojson: malha, updatedAt: new Date() },
      })
      await sleep(DELAY_MS)
    } else {
      console.log('  malha: already seeded (use db:update to refresh)')
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────────
  const [ec, mc, gc] = await Promise.all([
    prisma.estado.count(),
    prisma.municipio.count(),
    prisma.malhaEstado.count(),
  ])
  console.log(`\n✅ Done — ${ec} estados, ${mc} municípios, ${gc} malhas`)
}

main()
  .catch((err) => { console.error('\n❌ Fatal:', err.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
