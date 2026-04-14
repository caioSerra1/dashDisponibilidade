import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("dash")
    .withUsername("dash")
    .withPassword("dash")
    .start();

  process.env.DATABASE_URL = container.getConnectionUri();
  process.env.NEXTAUTH_URL = "http://localhost:3000";
  process.env.NEXTAUTH_SECRET = "ci-secret-ci-secret-ci-secret-xx";
  process.env.CRON_SECRET = "ci-cron-secret-ci-cron-secret-xx";

  execSync("npx prisma db push --skip-generate", {
    stdio: "inherit",
    env: process.env,
  });

  prisma = new PrismaClient();
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe("orchestrator runDaily", () => {
  it("cria snapshot idempotente para usuário ativo", async () => {
    vi.resetModules();

    await prisma.config.createMany({
      data: [
        { key: "valorDisponibilidade100", value: "1500" },
        { key: "valorPorPonto", value: "50" },
      ],
    });
    await prisma.slaTier.createMany({
      data: [
        { minPct: 100, payoutPct: 100, order: 0 },
        { minPct: 0, payoutPct: 0, order: 1 },
      ],
    });
    const user = await prisma.user.create({
      data: {
        email: "test@x.test",
        name: "Teste",
        passwordHash: "hash",
        clickupUserId: "111",
        active: true,
      },
    });

    vi.doMock("@/lib/clickup", () => ({
      getPointsForUser: async () => 10,
      testClickUp: async () => ({ ok: true, message: "ok" }),
    }));
    vi.doMock("@/lib/zabbix", () => ({
      listHosts: async () => [],
      getAvailability: async () => [{ hostId: "1", pct: 100 }],
      testZabbix: async () => ({ ok: true, message: "ok" }),
    }));

    const { runDaily } = await import("@/lib/orchestrator");

    const r1 = await runDaily(new Date("2026-04-15T12:00:00Z"));
    expect(r1.processed).toBe(1);

    const r2 = await runDaily(new Date("2026-04-15T13:00:00Z"));
    expect(r2.processed).toBe(1);

    const snaps = await prisma.dailySnapshot.findMany({ where: { userId: user.id } });
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.valorParcial).toBeGreaterThan(0);
  }, 60_000);
});
