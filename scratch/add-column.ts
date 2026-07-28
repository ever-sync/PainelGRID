import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "scheduled_target" INTEGER;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "allow_vendor_checkin" BOOLEAN DEFAULT true;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "allow_vendor_fipe" BOOLEAN DEFAULT true;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "allow_vendor_appointment" BOOLEAN DEFAULT true;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "allow_vendor_sale" BOOLEAN DEFAULT true;`);
  console.log('Successfully added all missing columns!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
