import 'server-only'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { router, publicProcedure } from '../trpc'
import { prisma, dbAvailable } from '../db'
import type { Estado, Municipio, MunicipioWithEstado } from '@/types'

const STATIC = path.join(process.cwd(), 'public', 'data')

function staticJSON<T>(filePath: string): T | null {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T } catch { return null }
}

async function withFallback<T>(
  dbFn: () => Promise<T | null>,
  staticPath: string
): Promise<T> {
  if (await dbAvailable()) {
    const result = await dbFn()
    if (result) return result
  }
  const file = staticJSON<T>(staticPath)
  if (file) return file
  throw new Error('Data not available. Run `npm run db:seed` or `npm run download`.')
}

// Module-level cache for static municipio search
let _staticMunicipios: MunicipioWithEstado[] | null = null

function getStaticMunicipios(): MunicipioWithEstado[] {
  if (_staticMunicipios) return _staticMunicipios
  const estados = staticJSON<Estado[]>(path.join(STATIC, 'estados.json')) ?? []
  _staticMunicipios = []
  for (const e of estados) {
    const municipios =
      staticJSON<Municipio[]>(path.join(STATIC, 'municipios', `${e.id}.json`)) ?? []
    for (const m of municipios) {
      _staticMunicipios.push({
        id: m.id,
        nome: m.nome,
        estadoId: e.id,
        estadoSigla: e.sigla.trim(),
        estadoNome: e.nome,
      })
    }
  }
  return _staticMunicipios
}

function normalizeStr(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export const ibgeRouter = router({
  estados: publicProcedure.query(() =>
    withFallback<Estado[]>(
      async () => {
        const rows = await prisma.estado.findMany({ orderBy: { nome: 'asc' } })
        if (!rows.length) return null
        return rows.map((r) => ({
          id: r.id,
          sigla: r.sigla.trim(),
          nome: r.nome,
          regiao: {
            id: r.regiaoId ?? 0,
            sigla: (r.regiaoSigla ?? '').trim(),
            nome: r.regiaoNome ?? '',
          },
        }))
      },
      path.join(STATIC, 'estados.json')
    )
  ),

  searchEstados: publicProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input }): Promise<Estado[]> => {
      const q = input.query.trim()
      if (!q) return []
      if (await dbAvailable()) {
        const rows = await prisma.estado.findMany({
          where: { OR: [
            { nome: { contains: q, mode: 'insensitive' } },
            { sigla: { contains: q, mode: 'insensitive' } },
          ]},
          orderBy: { nome: 'asc' },
          take: 5,
        })
        return rows.map((r) => ({
          id: r.id, sigla: r.sigla.trim(), nome: r.nome,
          regiao: { id: r.regiaoId ?? 0, sigla: (r.regiaoSigla ?? '').trim(), nome: r.regiaoNome ?? '' },
        }))
      }
      const all = staticJSON<Estado[]>(path.join(STATIC, 'estados.json')) ?? []
      const normalized = normalizeStr(q)
      return all
        .filter((e) => normalizeStr(e.nome).includes(normalized) || normalizeStr(e.sigla).includes(normalized))
        .slice(0, 5)
    }),

  searchMunicipios: publicProcedure
    .input(z.object({ query: z.string(), limit: z.number().int().min(1).max(30).default(12) }))
    .query(async ({ input }) => {
      const q = input.query.trim()
      if (!q) return [] as MunicipioWithEstado[]

      if (await dbAvailable()) {
        const rows = await prisma.municipio.findMany({
          where: { nome: { contains: q, mode: 'insensitive' } },
          include: { estado: { select: { sigla: true, nome: true } } },
          orderBy: { nome: 'asc' },
          take: input.limit,
        })
        return rows.map((r) => ({
          id: r.id,
          nome: r.nome,
          estadoId: r.estadoId,
          estadoSigla: r.estado.sigla.trim(),
          estadoNome: r.estado.nome,
        })) satisfies MunicipioWithEstado[]
      }

      const normalized = normalizeStr(q)
      return getStaticMunicipios()
        .filter((m) => normalizeStr(m.nome).includes(normalized))
        .slice(0, input.limit)
    }),

  getMunicipio: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }): Promise<MunicipioWithEstado | null> => {
      if (await dbAvailable()) {
        const row = await prisma.municipio.findUnique({
          where: { id: input.id },
          include: { estado: { select: { sigla: true, nome: true } } },
        })
        if (!row) return null
        return {
          id: row.id,
          nome: row.nome,
          estadoId: row.estadoId,
          estadoSigla: row.estado.sigla.trim(),
          estadoNome: row.estado.nome,
        }
      }
      return getStaticMunicipios().find((m) => m.id === input.id) ?? null
    }),

  malhaMunicipio: publicProcedure
    .input(z.object({ municipioId: z.number(), estadoId: z.number() }))
    .query(async ({ input }): Promise<GeoJSON.FeatureCollection | null> => {
      const estadoGeoJson = await withFallback<GeoJSON.FeatureCollection>(
        async () => {
          const row = await prisma.malhaEstado.findUnique({
            where: { estadoId: input.estadoId },
            select: { geojson: true },
          })
          return row ? (row.geojson as unknown as GeoJSON.FeatureCollection) : null
        },
        path.join(STATIC, 'malhas', `${input.estadoId}.geojson`)
      )
      const feature = estadoGeoJson.features.find(
        (f) => f.properties?.codarea === String(input.municipioId)
      )
      if (!feature) return null
      return { type: 'FeatureCollection', features: [feature] }
    }),

  // Kept for backward compat / status endpoint
  municipios: publicProcedure
    .input(z.object({ estadoId: z.number() }))
    .query(({ input }) =>
      withFallback<Municipio[]>(
        async () => {
          const rows = await prisma.municipio.findMany({
            where: { estadoId: input.estadoId },
            orderBy: { nome: 'asc' },
            select: { id: true, nome: true },
          })
          return rows.length ? rows : null
        },
        path.join(STATIC, 'municipios', `${input.estadoId}.json`)
      )
    ),

  malhaEstado: publicProcedure
    .input(z.object({ estadoId: z.number() }))
    .query(({ input }) =>
      withFallback<GeoJSON.FeatureCollection>(
        async () => {
          const row = await prisma.malhaEstado.findUnique({
            where: { estadoId: input.estadoId },
            select: { geojson: true },
          })
          return row ? (row.geojson as unknown as GeoJSON.FeatureCollection) : null
        },
        path.join(STATIC, 'malhas', `${input.estadoId}.geojson`)
      )
    ),

  status: publicProcedure.query(async () => {
    const db = await dbAvailable()
    let estadoCount = 0
    let malhaCount = 0
    let updatedAt: Date | null = null
    if (db) {
      estadoCount = await prisma.estado.count()
      malhaCount = await prisma.malhaEstado.count()
      const latest = await prisma.estado.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } })
      updatedAt = latest?.updatedAt ?? null
    }
    return {
      db,
      staticFiles: fs.existsSync(path.join(STATIC, 'estados.json')),
      estadoCount,
      malhaCount,
      updatedAt,
    }
  }),
})
