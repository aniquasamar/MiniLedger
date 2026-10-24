import 'dotenv/config';
import { app } from './app';
import { prisma } from './prisma';

const port = Number(process.env.PORT || 4000);
const server = app.listen(port, () => console.log(`MiniLedger API listening on http://localhost:${port}`));

async function shutdown() {
  server.close();
  await prisma.$disconnect();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
