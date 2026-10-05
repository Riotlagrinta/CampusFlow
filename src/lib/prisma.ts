import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Les requêtes ne sont journalisées qu'en développement : en production elles
// exposeraient des paramètres (identifiants, emails) dans les logs.
const isProduction = process.env.NODE_ENV === 'production';

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: isProduction ? ['error'] : ['query', 'error', 'warn'],
  });

if (!isProduction) globalForPrisma.prisma = prisma;
