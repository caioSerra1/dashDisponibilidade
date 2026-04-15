"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, ShoppingBag, Target, Megaphone, Check, CheckCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/date";

interface NotificationItem {
  id: string;
  type: "SYSTEM" | "REDEMPTION" | "GOAL" | "BROADCAST";
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

const ICON: Record<NotificationItem["type"], React.ComponentType<{ className?: string }>> = {
  SYSTEM: Bell,
  REDEMPTION: ShoppingBag,
  GOAL: Target,
  BROADCAST: Megaphone,
};

const TYPE_LABEL: Record<NotificationItem["type"], string> = {
  SYSTEM: "Sistema",
  REDEMPTION: "Loja",
  GOAL: "Meta",
  BROADCAST: "Aviso",
};

export function NotificacoesView() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  async function reload() {
    const r = await fetch("/api/me/notifications", { cache: "no-store" });
    const d = (await r.json()) as { items: NotificationItem[]; unread: number };
    setItems(d.items ?? []);
    setUnread(d.unread ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  async function markOne(id: string) {
    await fetch(`/api/me/notifications/${id}`, { method: "PATCH" });
    reload();
  }

  async function markAll() {
    await fetch("/api/me/notifications?action=read-all", { method: "POST" });
    reload();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Notificações
            {unread > 0 && (
              <span className="text-xs bg-destructive text-destructive-foreground rounded-full px-2 py-0.5">
                {unread} não lidas
              </span>
            )}
          </CardTitle>
          {unread > 0 && (
            <Button variant="outline" size="sm" onClick={markAll}>
              <CheckCheck className="h-4 w-4" />
              Marcar todas como lidas
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              Nenhuma notificação ainda. Quando algum pedido for atualizado ou um aviso for
              enviado, ele aparece aqui.
            </p>
          ) : (
            <div className="space-y-2">
              {items.map((n) => {
                const Icon = ICON[n.type] ?? Bell;
                const isUnread = !n.readAt;
                const Wrapper = ({ children }: { children: React.ReactNode }) =>
                  n.href ? (
                    <Link href={n.href} onClick={() => isUnread && markOne(n.id)}>
                      {children}
                    </Link>
                  ) : (
                    <div onClick={() => isUnread && markOne(n.id)}>{children}</div>
                  );
                return (
                  <Wrapper key={n.id}>
                    <div
                      className={cn(
                        "flex gap-3 rounded-md border p-4 transition-colors",
                        isUnread ? "bg-primary/5 border-primary/20" : "bg-card hover:bg-accent/30",
                      )}
                    >
                      <div
                        className={cn(
                          "h-10 w-10 shrink-0 rounded-md flex items-center justify-center",
                          isUnread
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold">{n.title}</p>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                            {TYPE_LABEL[n.type]}
                          </span>
                        </div>
                        {n.body && (
                          <p className="text-sm text-muted-foreground mt-1">{n.body}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {formatDate(n.createdAt)}
                        </p>
                      </div>
                      {isUnread && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            markOne(n.id);
                          }}
                          aria-label="marcar como lida"
                          className="shrink-0 self-start text-muted-foreground hover:text-primary"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </Wrapper>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
