import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DashboardView } from "./dashboard-view";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { userId } = await searchParams;
  const isAdmin = session.user.role === "ADMIN";

  if (userId && userId !== session.user.id) {
    if (!isAdmin) redirect("/dashboard");
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });
    if (!target) redirect("/mural");
    return (
      <DashboardView
        viewingUser={{ id: target.id, name: target.name }}
        isAdmin={isAdmin}
        currentUserId={session.user.id}
      />
    );
  }

  return (
    <DashboardView
      isAdmin={isAdmin}
      currentUserId={session.user.id}
    />
  );
}
