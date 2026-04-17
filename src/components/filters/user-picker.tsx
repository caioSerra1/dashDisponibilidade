"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Users } from "lucide-react";

const STORAGE_KEY = "admin-viewing-user-id";

interface TeamMember {
  id: string;
  name: string;
}

export function UserPicker({ currentUserId }: { currentUserId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [members, setMembers] = useState<TeamMember[]>([]);

  const urlUserId = searchParams.get("userId") ?? "";

  // Na primeira carga, se a URL não tem userId mas o sessionStorage tem,
  // redireciona pra manter a seleção entre páginas.
  useEffect(() => {
    if (!urlUserId && typeof window !== "undefined") {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved && saved !== currentUserId) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("userId", saved);
        router.replace(`${pathname}?${params.toString()}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    fetch("/api/admin/team", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.rows) return;
        setMembers(d.rows.map((r: { id: string; name: string }) => ({ id: r.id, name: r.name })));
      })
      .catch(() => {});
  }, []);

  if (members.length === 0) return null;

  function handleChange(userId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (userId) {
      params.set("userId", userId);
      sessionStorage.setItem(STORAGE_KEY, userId);
    } else {
      params.delete("userId");
      sessionStorage.removeItem(STORAGE_KEY);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="inline-flex items-center gap-2">
      <Users className="h-4 w-4 text-muted-foreground" />
      <select
        value={urlUserId}
        onChange={(e) => handleChange(e.target.value)}
        className="h-9 rounded-md border bg-card px-2 text-sm font-medium hover:border-primary/40 transition-colors cursor-pointer"
      >
        <option value="">
          {currentUserId ? "Meu painel" : "Selecionar colaborador"}
        </option>
        {members
          .filter((m) => m.id !== currentUserId)
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
      </select>
    </div>
  );
}
