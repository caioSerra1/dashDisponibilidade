"use client";
import { useEffect, useState } from "react";
import {
  Trash2,
  UserPlus,
  Eye,
  EyeOff,
  Pencil,
  KeyRound,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

interface User {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MEMBER";
  clickupUserId: string | null;
  active: boolean;
  showInMural: boolean;
}

type Toast = { kind: "ok" | "err"; text: string } | null;

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
  const [createError, setCreateError] = useState<string | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  function showToast(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 3500);
  }

  async function reload() {
    try {
      const d = await fetch("/api/admin/users").then((r) => r.json());
      setUsers(d.users ?? []);
    } catch {
      showToast({ kind: "err", text: "Falha ao carregar usuários" });
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setRole(role: "ADMIN" | "MEMBER") {
    setForm((f) => ({ ...f, role, showInMural: role === "MEMBER" }));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setCreateError(j.error ?? "Erro ao criar usuário");
      return;
    }
    setForm({
      email: "",
      name: "",
      password: "",
      role: "MEMBER",
      clickupUserId: "",
      showInMural: true,
    });
    showToast({ kind: "ok", text: "Usuário criado" });
    await reload();
  }

  async function patch(id: string, data: Partial<User>) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      showToast({ kind: "err", text: j.error ?? "Erro ao atualizar" });
      return false;
    }
    await reload();
    return true;
  }

  async function remove(id: string) {
    if (!confirm("Excluir este usuário?")) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    if (res.ok) {
      showToast({ kind: "ok", text: "Usuário excluído" });
      reload();
    } else {
      showToast({ kind: "err", text: "Erro ao excluir" });
    }
  }

  async function calculateNow() {
    setSyncing(true);
    try {
      const r = await fetch("/api/admin/sync", { method: "POST" });
      const j = await r.json();
      if (r.ok) {
        showToast({
          kind: "ok",
          text: `Apuração rodou — ${j.processed ?? 0} usuários processados`,
        });
      } else {
        showToast({ kind: "err", text: j.error ?? "Falha ao sincronizar" });
      }
    } catch {
      showToast({ kind: "err", text: "Erro de rede ao sincronizar" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 rounded-md border px-4 py-2 text-sm shadow-lg ${
            toast.kind === "ok"
              ? "bg-success/10 border-success/40 text-success"
              : "bg-destructive/10 border-destructive/40 text-destructive"
          }`}
        >
          {toast.text}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold">Usuários</h2>
        <Button variant="outline" onClick={calculateNow} disabled={syncing}>
          {syncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Calcular agora
        </Button>
      </div>

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
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
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
              {createError && <p className="text-sm text-destructive">{createError}</p>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usuários cadastrados ({users.length})</CardTitle>
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
                    <td className="py-2 font-medium">{u.name}</td>
                    <td className="py-2 text-muted-foreground">{u.email}</td>
                    <td className="py-2 text-xs font-mono text-muted-foreground">
                      {u.clickupUserId ?? "—"}
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
                    <td className="py-2 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditing(u)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(u.id)}
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {editing && (
        <EditUserDialog
          user={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            const ok = await patch(editing.id, data);
            if (ok) {
              showToast({ kind: "ok", text: "Usuário atualizado" });
              setEditing(null);
            }
          }}
          onPasswordReset={async (newPassword) => {
            const ok = await patch(editing.id, { password: newPassword } as Partial<User> & {
              password: string;
            });
            if (ok) showToast({ kind: "ok", text: "Senha redefinida" });
            return ok;
          }}
        />
      )}
    </div>
  );
}

function EditUserDialog({
  user,
  onClose,
  onSave,
  onPasswordReset,
}: {
  user: User;
  onClose: () => void;
  onSave: (data: Partial<User>) => Promise<void>;
  onPasswordReset: (password: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<"ADMIN" | "MEMBER">(user.role);
  const [clickupUserId, setClickupUserId] = useState(user.clickupUserId ?? "");
  const [showInMural, setShowInMural] = useState(user.showInMural);
  const [active, setActive] = useState(user.active);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave({
      name,
      email,
      role,
      clickupUserId: clickupUserId.trim() || null,
      showInMural,
      active,
    });
    setSaving(false);
  }

  async function handleResetPassword() {
    if (newPassword.length < 6) return;
    const ok = await onPasswordReset(newPassword);
    if (ok) setNewPassword("");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
          <DialogDescription>Altere os dados e salve.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>ID ClickUp</Label>
            <Input
              value={clickupUserId}
              onChange={(e) => setClickupUserId(e.target.value)}
              placeholder="123456"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Cargo</Label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as "ADMIN" | "MEMBER")}
            >
              <option value="MEMBER">Membro</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label>Aparece no mural</Label>
            <Switch checked={showInMural} onCheckedChange={setShowInMural} />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label>Ativo</Label>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>

        <div className="mt-4 rounded-md border p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="h-4 w-4" />
            Redefinir senha
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nova senha (mín. 6 caracteres)"
              minLength={6}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetPassword}
              disabled={newPassword.length < 6}
            >
              Redefinir
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
