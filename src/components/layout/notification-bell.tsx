"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck, Megaphone, Trophy, Target, ShoppingBag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/date";

interface NotificationItem {
  id: string;
  type: "SYSTEM" | "REDEMPTION" | "GOAL" | "ACHIEVEMENT" | "BROADCAST";
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
  ACHIEVEMENT: Trophy,
  BROADCAST: Megaphone,
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return formatDate(iso);
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/me/notifications", { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { items: NotificationItem[]; unread: number };
      setItems(d.items ?? []);
      setUnread(d.unread ?? 0);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    reload();
    const interval = setInterval(reload, 45_000);
    return () => clearInterval(interval);
  }, [reload]);

  // Fecha quando clica fora
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function markOne(id: string) {
    await fetch(`/api/me/notifications/${id}`, { method: "PATCH" });
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
    );
    setUnread((u) => Math.max(0, u - 1));
  }

  async function markAll() {
    await fetch("/api/me/notifications?action=read-all", { method: "POST" });
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnread(0);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent transition-colors"
        aria-label={`Notificações${unread > 0 ? ` (${unread} não lidas)` : ""}`}
      >
        <Bell className="h-5 w-5 text-muted-foreground" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-1">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)] z-50 bg-card border rounded-lg shadow-xl overflow-hidden"
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="text-sm font-semibold">Notificações</p>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAll}
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  <CheckCheck className="h-3 w-3" />
                  Marcar todas como lidas
                </button>
              )}
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">
                  Nenhuma notificação ainda.
                </p>
              ) : (
                items.map((n) => {
                  const Icon = ICON[n.type] ?? Bell;
                  const isUnread = !n.readAt;
                  const content = (
                    <div
                      className={cn(
                        "flex gap-3 px-4 py-3 border-b last:border-0 hover:bg-accent/40 transition-colors cursor-pointer",
                        isUnread && "bg-primary/5",
                      )}
                    >
                      <div
                        className={cn(
                          "h-8 w-8 shrink-0 rounded-md flex items-center justify-center",
                          isUnread ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium truncate">{n.title}</p>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {timeAgo(n.createdAt)}
                          </span>
                        </div>
                        {n.body && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {n.body}
                          </p>
                        )}
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
                          className="shrink-0 text-muted-foreground hover:text-primary"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                  if (n.href) {
                    return (
                      <Link
                        key={n.id}
                        href={n.href}
                        onClick={() => {
                          if (isUnread) markOne(n.id);
                          setOpen(false);
                        }}
                      >
                        {content}
                      </Link>
                    );
                  }
                  return (
                    <div key={n.id} onClick={() => isUnread && markOne(n.id)}>
                      {content}
                    </div>
                  );
                })
              )}
            </div>
            <div className="border-t px-4 py-2 bg-muted/30">
              <Link
                href="/notificacoes"
                onClick={() => setOpen(false)}
                className="text-xs text-primary hover:underline"
              >
                Ver todas as notificações
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
