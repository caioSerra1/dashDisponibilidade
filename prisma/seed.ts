import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_SLA_TIERS = [
  { minPct: 100, payoutPct: 100, order: 0 },
  { minPct: 99, payoutPct: 80, order: 1 },
  { minPct: 97, payoutPct: 60, order: 2 },
  { minPct: 95, payoutPct: 30, order: 3 },
  { minPct: 0, payoutPct: 0, order: 4 },
];

const DEFAULT_TASK_CLASSIFICATION = {
  dev: {
    listIds: ["901321219372"],
    folderIds: ["901314217806"],
  },
  support: {
    listIds: ["901321219373"],
    folderIds: [] as string[],
  },
};

const DEFAULT_CONFIG: Record<string, string> = {
  valorDisponibilidade100: "1500",
  valorPorPonto: "50",
  metaPontosMes: "40",
  metaSlaStreak: "99",
  taskClassification: JSON.stringify(DEFAULT_TASK_CLASSIFICATION),
};

async function main() {
  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    await prisma.config.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }

  const existingTiers = await prisma.slaTier.count();
  if (existingTiers === 0) {
    await prisma.slaTier.createMany({ data: DEFAULT_SLA_TIERS });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@local.test";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin12345";
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "Administrador",
      passwordHash,
      role: Role.ADMIN,
      active: true,
    },
  });

  // Garante Wallet para todo usuário existente (idempotente)
  const allUsers = await prisma.user.findMany({ select: { id: true } });
  for (const u of allUsers) {
    await prisma.wallet.upsert({
      where: { userId: u.id },
      update: {},
      create: { userId: u.id, coins: 0, lifetime: 0 },
    });
  }

  console.log(`Seed ok. admin=${admin.email}, users=${allUsers.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
