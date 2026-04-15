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

const DEFAULT_CONFIG: Record<string, string> = {
  valorDisponibilidade100: "1500",
  valorPorPonto: "50",
  metaPontosMes: "40",
  metaSlaStreak: "99",
  gamificationEnabled: "true",
};

// Conquistas iniciais com regra declarativa (admin pode editar/criar mais pela UI)
const ACHIEVEMENTS = [
  {
    code: "FIRST_MONTH_CLOSED",
    name: "Primeiro mês fechado",
    description: "Você fechou seu primeiro mês de apuração.",
    icon: "lucide:sparkles",
    xp: 50,
    coinsReward: 20,
    rule: { type: "FIRST_MONTH_CLOSED" },
  },
  {
    code: "SLA_100",
    name: "Disponibilidade Perfeita",
    description: "Fechou um mês com 100% de disponibilidade.",
    icon: "lucide:shield-check",
    xp: 200,
    coinsReward: 100,
    rule: { type: "SLA_MIN", value: 100 },
  },
  {
    code: "POINTS_GOAL",
    name: "Meta de pontos batida",
    description: "Atingiu a meta mensal de pontos de sprint.",
    icon: "lucide:target",
    xp: 150,
    coinsReward: 80,
    rule: { type: "POINTS_MIN_MONTH", value: 40 },
  },
];

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

  for (const ach of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { code: ach.code },
      update: {
        name: ach.name,
        description: ach.description,
        icon: ach.icon,
        xp: ach.xp,
        coinsReward: ach.coinsReward,
        rule: ach.rule,
      },
      create: ach,
    });
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
