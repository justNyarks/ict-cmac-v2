import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const reqs = await prisma.serviceRequest.findMany();
  console.log("REQS COUNT:", reqs.length);
  console.log("REQS DETAILS:", JSON.stringify(reqs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
