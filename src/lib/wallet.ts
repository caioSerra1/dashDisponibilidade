import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export class InsufficientFundsError extends Error {
  constructor() {
    super("Saldo insuficiente");
    this.name = "InsufficientFundsError";
  }
}

/**
 * Garante que o usuário tem wallet; cria com 0 se necessário.
 */
export async function ensureWallet(
  userId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.wallet.upsert({
    where: { userId },
    update: {},
    create: { userId, coins: 0, lifetime: 0 },
  });
}

export async function getBalance(userId: string): Promise<number> {
  const w = await prisma.wallet.findUnique({ where: { userId } });
  return w?.coins ?? 0;
}

export interface CreditInput {
  userId: string;
  amount: number;
  reason: string;
  refType?: string;
  refId?: string;
}

export async function credit(input: CreditInput): Promise<void> {
  if (input.amount <= 0) throw new Error("credit: amount must be positive");
  await prisma.$transaction(async (tx) => {
    await ensureWallet(input.userId, tx);
    await tx.wallet.update({
      where: { userId: input.userId },
      data: {
        coins: { increment: input.amount },
        lifetime: { increment: input.amount },
      },
    });
    await tx.coinTxn.create({
      data: {
        userId: input.userId,
        delta: input.amount,
        reason: input.reason,
        refType: input.refType,
        refId: input.refId,
      },
    });
  });
}

export interface DebitInput {
  userId: string;
  amount: number;
  reason: string;
  refType?: string;
  refId?: string;
}

export async function debit(input: DebitInput): Promise<void> {
  if (input.amount <= 0) throw new Error("debit: amount must be positive");
  await prisma.$transaction(async (tx) => {
    const wallet = await ensureWallet(input.userId, tx);
    if (wallet.coins < input.amount) throw new InsufficientFundsError();
    await tx.wallet.update({
      where: { userId: input.userId },
      data: { coins: { decrement: input.amount } },
    });
    await tx.coinTxn.create({
      data: {
        userId: input.userId,
        delta: -input.amount,
        reason: input.reason,
        refType: input.refType,
        refId: input.refId,
      },
    });
  });
}

/**
 * Estorno (refund) de um débito prévio. Usado quando pedido é rejeitado.
 */
export async function refund(input: CreditInput): Promise<void> {
  await credit({ ...input, reason: `refund:${input.reason}` });
}
