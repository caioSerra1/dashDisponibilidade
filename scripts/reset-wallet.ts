import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.goalHit.deleteMany({});
  await prisma.coinTxn.deleteMany({});
  await prisma.wallet.updateMany({ data: { coins: 0, lifetime: 0 } });
  console.log("reset ok");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
