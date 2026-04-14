"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, X, CheckCircle2, Clock, ThumbsUp, Truck, XCircle } from "lucide-react";
import { CoinBalance } from "@/components/game/coin-balance";
import { useUserData } from "@/components/providers/user-data";
import { formatDate } from "@/lib/date";

interface Redemption {
  id: string;
  status: "PENDING" | "APPROVED" | "DELIVERED" | "REJECTED";
  priceCoins: number;
  requestedAt: string;
  approvedAt: string | null;
  deliveredAt: string | null;
  note: string | null;
  item: { id: string; name: string; imageUrl: string | null };
}

const STATUS_LABEL: Record<Redemption["status"], string> = {
  PENDING: "Aguardando aprovação",
  APPROVED: "Aprovado — preparando",
  DELIVERED: "Entregue",
  REJECTED: "Recusado / cancelado",
};

const STATUS_VARIANT: Record<Redemption["status"], "default" | "warning" | "success" | "outline"> = {
  PENDING: "warning",
  APPROVED: "default",
  DELIVERED: "success",
  REJECTED: "outline",
};

const STEPS = [
  { key: "PENDING" as const, label: "Pedido", icon: Clock },
  { key: "APPROVED" as const, label: "Aprovado", icon: ThumbsUp },
  { key: "DELIVERED" as const, label: "Entregue", icon: Truck },
];

function statusIndex(status: Redemption["status"]): number {
  if (status === "DELIVERED") return 3;
  if (status === "APPROVED") return 2;
  if (status === "PENDING") return 1;
  return 0;
}

export function MinhasRetiradasView() {
  const { refresh: refreshWallet } = useUserData();
  const [list, setList] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    const r = await fetch("/api/me/redemptions");
    const d = await r.json();
    setList(d.redemptions ?? []);
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  async function cancel(id: string) {
    if (!confirm("Cancelar este pedido? As moedas serão estornadas pra você.")) return;
    setBusyId(id);
    const r = await fetch(`/api/me/redemptions/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? "Erro ao cancelar pedido");
      return;
    }
    refreshWallet();
    reload();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/loja">
            <ArrowLeft className="h-4 w-4" />
            Voltar à loja
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Meus pedidos</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Carregando…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Você ainda não fez nenhum resgate.</p>
          ) : (
            <div className="space-y-4">
              {list.map((r) => (
                <RedemptionCard
                  key={r.id}
                  redemption={r}
                  onCancel={cancel}
                  busy={busyId === r.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RedemptionCard({
  redemption: r,
  onCancel,
  busy,
}: {
  redemption: Redemption;
  onCancel: (id: string) => void;
  busy: boolean;
}) {
  const idx = statusIndex(r.status);
  const isRejected = r.status === "REJECTED";

  return (
    <div className="rounded-md border p-4 space-y-4">
      <div className="flex items-start gap-4">
        <div className="h-14 w-14 rounded-md bg-muted overflow-hidden flex-shrink-0">
          {r.item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.item.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{r.item.name}</p>
          <p className="text-xs text-muted-foreground">pedido em {formatDate(r.requestedAt)}</p>
          {r.note && (
            <p className="text-xs text-muted-foreground italic mt-1">nota do admin: {r.note}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <CoinBalance coins={r.priceCoins} size="sm" />
          <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
        </div>
      </div>

      {/* Timeline horizontal */}
      {!isRejected && (
        <div className="flex items-center gap-2">
          {STEPS.map((step, i) => {
            const reached = idx > i;
            const Icon = reached ? CheckCircle2 : step.icon;
            return (
              <div key={step.key} className="flex items-center gap-2 flex-1">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    reached
                      ? "bg-success text-success-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span
                  className={`text-xs ${reached ? "font-medium text-foreground" : "text-muted-foreground"}`}
                >
                  {step.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-px ${reached && idx > i + 1 ? "bg-success" : "bg-border"}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      {isRejected && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <XCircle className="h-4 w-4 text-destructive" />
          Pedido recusado/cancelado — moedas estornadas para a sua carteira.
        </div>
      )}

      {/* Botão cancelar (apenas pendentes) */}
      {r.status === "PENDING" && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCancel(r.id)}
            disabled={busy}
            className="text-destructive border-destructive/30 hover:bg-destructive/5"
          >
            <X className="h-4 w-4" />
            Cancelar pedido
          </Button>
        </div>
      )}
    </div>
  );
}
