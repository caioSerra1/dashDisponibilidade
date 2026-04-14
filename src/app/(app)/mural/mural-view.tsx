"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Trophy, Medal, Award, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CoinBalance } from "@/components/game/coin-balance";
import { formatMonth } from "@/lib/date";

interface MuralCardData {
  user: { id: string; name: string; email: string; bio: string | null };
  pontos: number;
  sla: number;
  coinsGained: number;
  achievements: Array<{ code: string; name: string; icon: string; unlockedAt: string }>;
  isClosed: boolean;
}

interface MuralData {
  month: { year: number; month: number };
  cards: MuralCardData[];
}

const MEDALS = [Trophy, Medal, Award];
const MEDAL_COLORS = ["text-amber-400", "text-slate-300", "text-orange-500"];

export function MuralView() {
  const [data, setData] = useState<MuralData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/mural")
      .then((r) => r.json())
      .then((d: MuralData) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground">Carregando…</p>;
  if (!data) return <p className="text-destructive">Erro ao carregar mural.</p>;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          Mural do time
        </h2>
        <p className="text-sm text-muted-foreground">
          Conquistas, ranking e progresso de {formatMonth(data.month.year, data.month.month)}.
        </p>
      </div>

      {data.cards.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Nenhum colaborador ativo ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.cards.map((card, idx) => (
            <MuralCard key={card.user.id} card={card} rank={idx} />
          ))}
        </div>
      )}
    </div>
  );
}

function MuralCard({ card, rank }: { card: MuralCardData; rank: number }) {
  const Medal = rank < 3 ? MEDALS[rank]! : null;
  const medalColor = rank < 3 ? MEDAL_COLORS[rank]! : "";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.08 }}
    >
      <Card className={`overflow-hidden ${rank === 0 ? "border-amber-300/60 ring-1 ring-amber-300/40" : ""}`}>
        <CardHeader className="flex flex-row items-start gap-4">
          <Avatar userId={card.user.id} name={card.user.name} size={64} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="truncate">{card.user.name}</CardTitle>
              {Medal && <Medal className={`h-5 w-5 ${medalColor}`} />}
            </div>
            <p className="text-xs text-muted-foreground truncate">{card.user.email}</p>
            {card.user.bio && <p className="text-xs mt-1 italic">{card.user.bio}</p>}
          </div>
          {card.isClosed && <Badge variant="success">fechado</Badge>}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Pontos" value={String(card.pontos)} />
            <Stat label="Disponibilidade" value={`${card.sla.toFixed(1)}%`} />
            <Stat label="Moedas no mês" value={`+${card.coinsGained}`} />
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">
              Conquistas no mês ({card.achievements.length})
            </p>
            {card.achievements.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma ainda — bora desbloquear?</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {card.achievements.map((a) => (
                  <Badge key={a.code} variant="secondary" className="text-xs">
                    {a.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card/50 p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-bold mt-0.5">{value}</p>
    </div>
  );
}
