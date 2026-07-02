import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const reqs = await prisma.serviceRequest.findMany();
  console.log("REQS COUNT:", reqs.length);
}

main().catch(console.error).finally(() => prisma.$disconnect());
