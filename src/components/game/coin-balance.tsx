"use client";
import { Coins } from "lucide-react";
import { cn } from "@/lib/cn";

interface CoinBalanceProps {
  coins: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function CoinBalance({ coins, size = "md", className }: CoinBalanceProps) {
  const sizeClass =
    size === "sm" ? "text-xs h-7 px-2.5" : size === "lg" ? "text-base h-11 px-4" : "text-sm h-9 px-3";
  const iconSize = size === "sm" ? 14 : size === "lg" ? 20 : 16;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-semibold border border-amber-300/40",
        sizeClass,
        className,
      )}
    >
      <Coins style={{ width: iconSize, height: iconSize }} />
      <span className="tabular-nums">{coins.toLocaleString("pt-BR")}</span>
    </div>
  );
}
