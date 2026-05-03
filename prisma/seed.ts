const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  const password = await bcrypt.hash('password123', 10)

  const schools = ['SNAHS', 'SBAHM', 'SITE', 'SASTE', 'MEDICINE', 'BEU']
  
  // Create Secretary for each department
  for (const s of schools) {
    await prisma.user.upsert({
      where: { email: `secretary@${s.toLowerCase()}.edu` },
      update: {
        password: password, // Reset password to default for ease of testing
      },
      create: {
        email: `secretary@${s.toLowerCase()}.edu`,
        name: `Secretary of ${s}`,
        password: password,
        role: 'SECRETARY',
        school: s,
      },
    })
  }

  // Create Coordinator
  await prisma.user.upsert({
    where: { email: 'coordinator@ict.edu' },
    update: { password: password },
    create: {
      email: 'coordinator@ict.edu',
      name: 'Liza Mendoza',
      password: password,
      role: 'CMAC_COORDINATOR',
    },
  })

  // Create Director
  await prisma.user.upsert({
    where: { email: 'director@ict.edu' },
    update: { password: password },
    create: {
      email: 'director@ict.edu',
      name: 'Dir. Ramon Dela Cruz',
      password: password,
      role: 'ICT_DIRECTOR',
    },
  })

  console.log('Seed completed. Accounts created for all departments.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
