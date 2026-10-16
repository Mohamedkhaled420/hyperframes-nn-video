import { PrismaClient } from '@prisma/client'

// Scaffold module (currently unused by the app). Fallback keeps it import-safe
// on hosts where DATABASE_URL isn't set (e.g. Vercel preview builds).
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./db/custom.db'
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db