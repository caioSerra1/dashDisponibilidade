import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ProdutividadeView } from "./produtividade-view";

export default async function ProdutividadePage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { userId } = await searchParams;
  const isAdmin = session.user.role === "ADMIN";

  if (userId && userId !== session.user.id && isAdmin) {
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });
    if (!target) redirect("/dashboard/produtividade");
    return (
      <ProdutividadeView
        viewingUser={{ id: target.id, name: target.name }}
        isAdmin
        currentUserId={session.user.id}
      />
    );
  }

  return (
    <ProdutividadeView
      isAdmin={isAdmin}
      currentUserId={session.user.id}
    />
  );
}
