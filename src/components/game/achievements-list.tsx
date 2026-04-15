"use client";
import { motion } from "framer-motion";
import { formatDate } from "@/lib/date";
import { RenderIcon } from "@/components/ui/icon-picker";

interface Achievement {
  code: string;
  name: string;
  description: string;
  icon: string;
  xp: number;
  unlockedAt: string;
}

export function AchievementsList({ items }: { items: Achievement[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma conquista ainda. Feche um mês para começar.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {items.slice(0, 4).map((a, i) => (
        <motion.div
          key={a.code}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="flex items-center gap-3 rounded-md border bg-card/50 p-2"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary text-lg">
            <RenderIcon value={a.icon} className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{a.name}</p>
            <p className="text-xs text-muted-foreground truncate">{a.description}</p>
          </div>
          <span className="text-xs text-muted-foreground">{formatDate(a.unlockedAt)}</span>
        </motion.div>
      ))}
    </div>
  );
}
