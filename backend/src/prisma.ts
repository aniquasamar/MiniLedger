import { PrismaClient } from '@prisma/client';

// One Prisma client instance is shared across the app.
export const prisma = new PrismaClient();
