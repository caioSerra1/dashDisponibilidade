import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { CargaView } from "./carga-view";

export default async function CargaPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/dashboard");
  return <CargaView />;
}
