"use client";
import { useEffect, useState } from "react";
import { Trash2, UserPlus, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

interface User {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MEMBER";
  clickupUserId: string | null;
  active: boolean;
  showInMural: boolean;
}

export function UsersView() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({
    email: "",
    name: "",
    password: "",
    role: "MEMBER" as "ADMIN" | "MEMBER",
    clickupUserId: "",
    showInMural: true,
  });
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const d = await fetch("/api/admin/users").then((r) => r.json());
    setUsers(d.users);
  }

  useEffect(() => {
    reload();
  }, []);

  // Quando muda o role, atualiza o default do showInMural (só se o admin não tocou ainda)
  function setRole(role: "ADMIN" | "MEMBER") {
    setForm((f) => ({ ...f, role, showInMural: role === "MEMBER" }));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      setError("Erro ao criar usuário");
      return;
    }
    setForm({ email: "", name: "", password: "", role: "MEMBER", clickupUserId: "", showInMural: true });
    await reload();
  }

  async function patch(id: string, data: Partial<User>) {
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await reload();
  }

  async function remove(id: string) {
    if (!confirm("Excluir este usuário?")) return;
    await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    await reload();
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Novo usuário
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Senha inicial</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                minLength={6}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>ID ClickUp</Label>
              <Input
                value={form.clickupUserId}
                onChange={(e) => setForm({ ...form, clickupUserId: e.target.value })}
                placeholder="123456"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cargo</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.role}
                onChange={(e) => setRole(e.target.value as "ADMIN" | "MEMBER")}
              >
                <option value="MEMBER">Membro</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <Label>Aparece no mural</Label>
                <p className="text-xs text-muted-foreground">
                  Default: membros sim, admins não.
                </p>
              </div>
              <Switch
                checked={form.showInMural}
                onCheckedChange={(v) => setForm({ ...form, showInMural: v })}
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-3">
              <Button type="submit">Criar usuário</Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usuários ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="py-2 font-medium">Nome</th>
                  <th className="py-2 font-medium">E-mail</th>
                  <th className="py-2 font-medium">ID ClickUp</th>
                  <th className="py-2 font-medium">Cargo</th>
                  <th className="py-2 font-medium">Mural</th>
                  <th className="py-2 font-medium">Ativo</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="py-2">{u.name}</td>
                    <td className="py-2 text-muted-foreground">{u.email}</td>
                    <td className="py-2">
                      <Input
                        className="h-8 w-32"
                        defaultValue={u.clickupUserId ?? ""}
                        onBlur={(e) =>
                          patch(u.id, { clickupUserId: e.target.value || null })
                        }
                      />
                    </td>
                    <td className="py-2">
                      <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>
                        {u.role === "ADMIN" ? "Admin" : "Membro"}
                      </Badge>
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => patch(u.id, { showInMural: !u.showInMural })}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        title={u.showInMural ? "Visível no mural" : "Oculto do mural"}
                      >
                        {u.showInMural ? (
                          <>
                            <Eye className="h-4 w-4 text-success" />
                            <span>Sim</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                            <span>Não</span>
                          </>
                        )}
                      </button>
                    </td>
                    <td className="py-2">
                      <Switch
                        checked={u.active}
                        onCheckedChange={(v) => patch(u.id, { active: v })}
                      />
                    </td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" size="icon" onClick={() => remove(u.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
