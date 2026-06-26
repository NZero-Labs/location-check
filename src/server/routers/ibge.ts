import 'server-only'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { router, publicProcedure } from '../trpc'
import { prisma, dbAvailable } from '../db'
import type { Estado, Municipio } from '@/types'

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
