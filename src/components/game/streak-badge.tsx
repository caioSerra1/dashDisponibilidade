"use client";
import { motion } from "framer-motion";
import { Flame } from "lucide-react";

export function StreakBadge({ days, meta }: { days: number; meta: number }) {
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="flex items-center gap-3 rounded-lg border bg-accent/30 p-3"
    >
      <motion.div
        animate={{ rotate: [0, -5, 5, 0] }}
        transition={{ repeat: Infinity, duration: 2 }}
      >
        <Flame className="h-8 w-8 text-primary" />
      </motion.div>
      <div>
        <p className="text-sm font-semibold">
          Sequência de {days} {days === 1 ? "dia" : "dias"}
        </p>
        <p className="text-xs text-muted-foreground">acima de {meta}% de disponibilidade</p>
      </div>
    </motion.div>
  );
}
