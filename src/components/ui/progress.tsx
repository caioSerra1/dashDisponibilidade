"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

interface ProgressProps {
  value: number;          // 0..100
  className?: string;
  barClassName?: string;
}

export function Progress({ value, className, barClassName }: ProgressProps) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${safe}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={cn("h-full bg-primary", barClassName)}
      />
    </div>
  );
}
