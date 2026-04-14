"use client";
import { useEffect, useState } from "react";
import { Megaphone, Send, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/ui/avatar";

interface UserSlim {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

export function BroadcastView() {
  const [users, setUsers] = useState<UserSlim[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allUsers, setAllUsers] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [href, setHref] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d: { users: UserSlim[] }) => setUsers(d.users.filter((u) => u.active)));
  }, []);

  function toggleUser(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    setSending(true);
    setFeedback(null);
    const r = await fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        body: body || undefined,
        href: href || undefined,
        userIds: allUsers ? undefined : Array.from(selected),
      }),
    });
    setSending(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setFeedback(`Erro: ${j.error ?? "desconhecido"}`);
      return;
    }
    const j = (await r.json()) as { count: number };
    setFeedback(`✅ Enviado para ${j.count} pessoa(s).`);
    setTitle("");
    setBody("");
    setHref("");
    setTimeout(() => setFeedback(null), 4000);
  }

  const targetCount = allUsers ? users.length : selected.size;

  return (
    <div className="grid gap-6 lg:grid-cols-3 max-w-6xl">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Nova mensagem para o time
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Reunião de sprint amanhã às 10h"
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Mensagem</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Detalhes opcionais — até 800 caracteres"
              maxLength={800}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">{body.length}/800</p>
          </div>
          <div className="space-y-1.5">
            <Label>Link opcional</Label>
            <Input
              value={href}
              onChange={(e) => setHref(e.target.value)}
              placeholder="/dashboard ou https://…"
            />
            <p className="text-xs text-muted-foreground">
              Quando o usuário clicar na notificação, vai pra esse link.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-sm text-muted-foreground">
              Vai para <strong className="text-foreground">{targetCount}</strong> destinatário(s).
            </p>
            <Button onClick={send} disabled={!title || sending || targetCount === 0}>
              <Send className="h-4 w-4" />
              Enviar
            </Button>
          </div>
          {feedback && <p className="text-sm">{feedback}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-primary" />
            Destinatários
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center justify-between rounded-md border p-3 cursor-pointer">
            <div>
              <p className="text-sm font-medium">Todos do time</p>
              <p className="text-xs text-muted-foreground">{users.length} pessoas ativas</p>
            </div>
            <input
              type="checkbox"
              checked={allUsers}
              onChange={(e) => setAllUsers(e.target.checked)}
              className="h-4 w-4"
            />
          </label>

          {!allUsers && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Escolha individualmente:</p>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {users.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-2 rounded-md p-2 hover:bg-accent cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(u.id)}
                      onChange={() => toggleUser(u.id)}
                      className="h-4 w-4"
                    />
                    <Avatar userId={u.id} name={u.name} size={28} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
