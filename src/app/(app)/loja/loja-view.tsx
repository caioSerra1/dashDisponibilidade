"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles, ShoppingBag, History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CoinBalance } from "@/components/game/coin-balance";
import { useUserData } from "@/components/providers/user-data";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface StoreItem {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  priceCoins: number;
  stock: number | null;
  featured: boolean;
}

export function LojaView() {
  const { coins, refresh: refreshWallet } = useUserData();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/store/items")
      .then((r) => r.json())
      .then((s) => setItems(s.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function redeem(item: StoreItem) {
    setRedeemingId(item.id);
    setError(null);
    setSuccess(null);
    const r = await fetch("/api/store/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id }),
    });
    setRedeemingId(null);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Erro no resgate");
      return;
    }
    setSuccess(`${item.name} pedido com sucesso! Aguardando aprovação do admin.`);
    refreshWallet();
    setTimeout(() => setSuccess(null), 4000);
  }

  const featured = items.filter((i) => i.featured);
  const others = items.filter((i) => !i.featured);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-primary" />
            Loja de moedas
          </h2>
          <p className="text-sm text-muted-foreground">Resgate prêmios usando moedas que você ganhou ao bater metas.</p>
        </div>
        <div className="flex items-center gap-3">
          <CoinBalance coins={coins} size="lg" />
          <Button asChild variant="outline">
            <Link href="/loja/minhas-retiradas">
              <History className="h-4 w-4" />
              Meus pedidos
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-success/40 bg-success/5 p-3 text-sm text-success">
          {success}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">
              Nenhum item cadastrado ainda. O admin precisa publicar itens em{" "}
              <strong>Loja — Itens</strong>.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {featured.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Destaques
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    coins={coins}
                    onRedeem={redeem}
                    redeeming={redeemingId === item.id}
                    featured
                  />
                ))}
              </div>
            </section>
          )}

          {others.length > 0 && (
            <section>
              {featured.length > 0 && (
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                  Catálogo
                </h3>
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {others.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    coins={coins}
                    onRedeem={redeem}
                    redeeming={redeemingId === item.id}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ItemCard({
  item,
  coins,
  onRedeem,
  redeeming,
  featured,
}: {
  item: StoreItem;
  coins: number;
  onRedeem: (item: StoreItem) => void;
  redeeming: boolean;
  featured?: boolean;
}) {
  const canAfford = coins >= item.priceCoins;
  const outOfStock = item.stock !== null && item.stock <= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full"
    >
      <Card
        className={`h-full flex flex-col overflow-hidden ${featured ? "border-primary/40 ring-1 ring-primary/20" : ""}`}
      >
        <div className="aspect-video bg-muted relative overflow-hidden">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground">
              <ShoppingBag className="h-12 w-12 opacity-30" />
            </div>
          )}
          {featured && (
            <Badge variant="warning" className="absolute top-2 left-2">
              destaque
            </Badge>
          )}
        </div>
        <CardContent className="p-4 flex-1 flex flex-col">
          <h4 className="font-semibold">{item.name}</h4>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 flex-1">
            {item.description}
          </p>
          <div className="mt-3 flex items-center justify-between">
            <CoinBalance coins={item.priceCoins} size="sm" />
            {item.stock !== null && (
              <span className="text-xs text-muted-foreground">{item.stock} em estoque</span>
            )}
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button
                className="mt-3 w-full"
                disabled={!canAfford || outOfStock || redeeming}
              >
                {outOfStock
                  ? "Esgotado"
                  : !canAfford
                    ? `Faltam ${item.priceCoins - coins} moedas`
                    : "Resgatar"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirmar resgate</DialogTitle>
                <DialogDescription>
                  Você vai trocar <strong>{item.priceCoins} moedas</strong> por{" "}
                  <strong>{item.name}</strong>. O pedido será enviado ao admin para aprovação
                  e entrega presencial.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={(e) => e.currentTarget.closest("[role=dialog]")?.querySelector<HTMLButtonElement>("[aria-label=fechar]")?.click()}>
                  Cancelar
                </Button>
                <Button
                  onClick={(e) => {
                    onRedeem(item);
                    e.currentTarget.closest("[role=dialog]")?.querySelector<HTMLButtonElement>("[aria-label=fechar]")?.click();
                  }}
                  disabled={redeeming}
                >
                  Confirmar resgate
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </motion.div>
  );
}
