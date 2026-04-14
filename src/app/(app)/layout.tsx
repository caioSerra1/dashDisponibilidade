import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <AppShell
      user={{
        id: session.user.id,
        name: session.user.name ?? session.user.email ?? "?",
        email: session.user.email ?? "",
        role: session.user.role,
      }}
    >
      {children}
    </AppShell>
  );
}
