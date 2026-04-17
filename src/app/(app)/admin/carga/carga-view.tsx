"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  ExternalLink,
  RefreshCw,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";

interface TaskInExecution {
  id: string;
  customId: string | null;
  name: string;
  points: number | null;
  priority: "urgent" | "high" | "normal" | "low" | null;
  status: string | null;
  dateCreated: number | null;
  url: string;
}

interface MemberCarga {
  userId: string;
  name: string;
  inExecution: TaskInExecution[];
  otherOpen: number;
  totalOpen: number;
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "bg-destructive text-destructive-foreground",
  high: "bg-orange-500 text-white",
  normal: "bg-primary/10 text-primary",
  low: "bg-muted text-muted-foreground",
};

const PRIORITY_LABEL: Record<string, string> = {
  urgent: "urgente",
  high: "alta",
  normal: "normal",
  low: "baixa",
};

export function CargaView() {
  const [members, setMembers] = useState<MemberCarga[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/admin/carga", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setMembers(d.members ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const totalInExec = members.reduce((a, m) => a + m.inExecution.length, 0);
  const maxInExec = Math.max(1, ...members.map((m) => m.inExecution.length));

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Carga do time
          </h2>
          <p className="text-sm text-muted-foreground">
            {totalInExec} tasks em execução distribuídas entre {members.length} colaboradores
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando do ClickUp…</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Distribuição de carga
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {members.map((m) => {
                const pct = (m.inExecution.length / maxInExec) * 100;
                return (
                  <div key={m.userId}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Avatar userId={m.userId} name={m.name} size={24} />
                        <span className="text-sm font-medium">{m.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-bold tabular-nums">
                          {m.inExecution.length}
                        </span>
                        <span className="text-muted-foreground">
                          em execução
                        </span>
                        {m.otherOpen > 0 && (
                          <span className="text-[11px] text-muted-foreground">
                            (+{m.otherOpen} abertas)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {members.map((m) => (
            <Card key={m.userId}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Avatar userId={m.userId} name={m.name} size={36} />
                  <div>
                    <CardTitle className="text-base">{m.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {m.inExecution.length} em execução · {m.otherOpen} outras
                      abertas · {m.totalOpen} total
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {m.inExecution.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma task em execução no momento.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {m.inExecution.map((t) => {
                      const ageMs = t.dateCreated
                        ? Date.now() - t.dateCreated
                        : null;
                      const ageDays = ageMs
                        ? Math.floor(ageMs / 86_400_000)
                        : null;
                      return (
                        <a
                          key={t.id}
                          href={t.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-center gap-3 rounded-md border p-3 hover:border-primary/40 hover:bg-accent/30 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium truncate group-hover:text-primary text-sm">
                                {t.name}
                              </p>
                              {t.customId && (
                                <span className="text-[10px] font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                                  {t.customId}
                                </span>
                              )}
                              {t.priority && (
                                <span
                                  className={`text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 font-medium ${PRIORITY_COLOR[t.priority] ?? ""}`}
                                >
                                  {PRIORITY_LABEL[t.priority] ?? t.priority}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <Badge variant="secondary" className="text-[10px]">
                                {t.status}
                              </Badge>
                              {ageDays != null && (
                                <span>
                                  aberta há {ageDays} {ageDays === 1 ? "dia" : "dias"}
                                </span>
                              )}
                              {t.points != null && t.points > 0 && (
                                <span className="font-semibold text-primary">
                                  {t.points} pts
                                </span>
                              )}
                            </div>
                          </div>
                          <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
                        </a>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
