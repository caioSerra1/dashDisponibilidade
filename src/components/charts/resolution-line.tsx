"use client";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { formatDate } from "@/lib/date";

interface Point {
  date: string;
  avgResolutionHoursMonth: number | null;
}

export function ResolutionLineChart({ data }: { data: Point[] }) {
  return (
    <div className="h-56 -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis
            dataKey="date"
            fontSize={11}
            tickFormatter={(d) => formatDate(d).slice(0, 5)}
            stroke="hsl(var(--muted-foreground))"
          />
          <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" unit="h" />
          <Tooltip
            labelFormatter={(d) => formatDate(String(d))}
            formatter={(value) => {
              const num = typeof value === "number" ? value : Number(value);
              return [Number.isFinite(num) ? `${num.toFixed(2)} h` : "—", "Tempo médio"];
            }}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
            }}
          />
          <Line
            type="monotone"
            dataKey="avgResolutionHoursMonth"
            name="Tempo médio"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
