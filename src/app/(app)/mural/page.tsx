import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MuralView } from "./mural-view";

export default async function MuralPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/dashboard");
  return <MuralView />;
}
