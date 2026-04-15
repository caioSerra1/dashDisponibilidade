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

  // Admin pode ver dashboard de outro colaborador via ?userId=
  if (userId && userId !== session.user.id) {
    if (session.user.role !== "ADMIN") redirect("/dashboard");
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });
    if (!target) redirect("/mural");
    return <DashboardView viewingUser={{ id: target.id, name: target.name }} />;
  }

  return <DashboardView />;
}
