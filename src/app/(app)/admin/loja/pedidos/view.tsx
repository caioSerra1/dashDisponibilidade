"use client";
import { useEffect, useState } from "react";
import { Check, X, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { CoinBalance } from "@/components/game/coin-balance";
import { formatDate } from "@/lib/date";

interface Redemption {
  id: string;
  status: "PENDING" | "APPROVED" | "DELIVERED" | "REJECTED";
  priceCoins: number;
  requestedAt: string;
  approvedAt: string | null;
  deliveredAt: string | null;
  note: string | null;
  user: { id: string; name: string; email: string };
  item: { id: string; name: string; imageUrl: string | null };
}

const STATUS_LABEL: Record<Redemption["status"], string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovado",
  DELIVERED: "Entregue",
  REJECTED: "Recusado",
};

const STATUS_VARIANT: Record<Redemption["status"], "default" | "warning" | "success" | "outline"> = {
  PENDING: "warning",
  APPROVED: "default",
  DELIVERED: "success",
  REJECTED: "outline",
};

export function LojaPedidosView() {
  const [list, setList] = useState<Redemption[]>([]);
  const [filter, setFilter] = useState<"all" | Redemption["status"]>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    const r = await fetch("/api/admin/redemptions").then((x) => x.json());
    setList(r.redemptions ?? []);
  }

  useEffect(() => {
    reload();
  }, []);

  async function action(id: string, act: "APPROVE" | "DELIVER" | "REJECT") {
    setBusyId(id);
    let note: string | undefined;
    if (act === "REJECT") {
      const reason = prompt("Motivo da recusa? (opcional)") ?? undefined;
      note = reason || undefined;
    }
    await fetch(`/api/admin/redemptions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: act, note }),
    });
    setBusyId(null);
    reload();
  }

  const filtered = filter === "all" ? list : list.filter((r) => r.status === filter);

  return (
    <div className="space-y-6 max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle>Pedidos de resgate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {(["all", "PENDING", "APPROVED", "DELIVERED", "REJECTED"] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "outline"}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "Todos" : STATUS_LABEL[f]}
                <span className="ml-1.5 text-xs opacity-70">
                  {f === "all" ? list.length : list.filter((r) => r.status === f).length}
                </span>
              </Button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pedido neste filtro.</p>
          ) : (
            <div className="space-y-3">
              {filtered.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border p-3"
                >
                  <Avatar userId={r.user.id} name={r.user.name} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{r.user.name}</p>
                      <span className="text-xs text-muted-foreground">resgatou</span>
                      <p className="font-medium truncate">{r.item.name}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(r.requestedAt)}
                    </p>
                    {r.note && (
                      <p className="text-xs italic text-muted-foreground mt-0.5">
                        nota: {r.note}
                      </p>
                    )}
                  </div>
                  <CoinBalance coins={r.priceCoins} size="sm" />
                  <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  <div className="flex gap-1.5">
                    {r.status === "PENDING" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => action(r.id, "APPROVE")}
                          disabled={busyId === r.id}
                        >
                          <Check className="h-4 w-4" />
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => action(r.id, "REJECT")}
                          disabled={busyId === r.id}
                        >
                          <X className="h-4 w-4" />
                          Recusar
                        </Button>
                      </>
                    )}
                    {(r.status === "PENDING" || r.status === "APPROVED") && (
                      <Button
                        size="sm"
                        onClick={() => action(r.id, "DELIVER")}
                        disabled={busyId === r.id}
                      >
                        <Truck className="h-4 w-4" />
                        Entregar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
