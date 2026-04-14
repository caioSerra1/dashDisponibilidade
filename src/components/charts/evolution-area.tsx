"use client";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { formatBRL } from "@/lib/money";
import { formatDate } from "@/lib/date";

interface Point {
  date: string;
  valorParcial: number;
}

export function EvolutionAreaChart({ data }: { data: Point[] }) {
  return (
    <div className="h-64 -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="valorGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => formatDate(d).slice(0, 5)}
            fontSize={11}
            stroke="hsl(var(--muted-foreground))"
          />
          <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
          <Tooltip
            formatter={(v: number) => formatBRL(v)}
            labelFormatter={(d) => formatDate(String(d))}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
            }}
          />
          <Area
            type="monotone"
            dataKey="valorParcial"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="url(#valorGrad)"
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
