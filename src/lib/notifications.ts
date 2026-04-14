import { NotificationType } from "@prisma/client";
import { prisma } from "./db";

export interface CreateNotificationInput {
  userId: string;
  type?: NotificationType;
  title: string;
  body?: string;
  href?: string;
  refType?: string;
  refId?: string;
}

export async function createNotification(input: CreateNotificationInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type ?? NotificationType.SYSTEM,
      title: input.title,
      body: input.body,
      href: input.href,
      refType: input.refType,
      refId: input.refId,
    },
  });
}

export interface BroadcastInput {
  type?: NotificationType;
  title: string;
  body?: string;
  href?: string;
  /** Lista opcional de userIds. Se vazio, envia para todos os usuários ativos. */
  userIds?: string[];
}

export async function broadcastNotification(input: BroadcastInput) {
  let recipients: string[];
  if (input.userIds && input.userIds.length > 0) {
    recipients = input.userIds;
  } else {
    const users = await prisma.user.findMany({
      where: { active: true },
      select: { id: true },
    });
    recipients = users.map((u) => u.id);
  }
  if (recipients.length === 0) return { count: 0 };

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: input.type ?? NotificationType.BROADCAST,
      title: input.title,
      body: input.body,
      href: input.href,
    })),
  });

  return { count: recipients.length };
}

export async function listForUser(userId: string, limit = 30) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, readAt: null },
  });
}

export async function markAsRead(userId: string, id: string) {
  return prisma.notification.updateMany({
    where: { id, userId },
    data: { readAt: new Date() },
  });
}

export async function markAllAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
