import { PrismaClient } from '@prisma/client';

// Una única instancia por proceso.
export const prisma = new PrismaClient();
