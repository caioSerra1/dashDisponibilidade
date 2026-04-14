"use client";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { formatDate } from "@/lib/date";

interface Point {
  date: string;
  tasksClosedMonth: number;
}

export function TasksBarChart({ data }: { data: Point[] }) {
  return (
    <div className="h-64 -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis
            dataKey="date"
            fontSize={11}
            tickFormatter={(d) => formatDate(d).slice(0, 5)}
            stroke="hsl(var(--muted-foreground))"
          />
          <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
          <Tooltip
            labelFormatter={(d) => formatDate(String(d))}
            formatter={(value: number) => [value, "Tasks fechadas"]}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
            }}
          />
          <Bar
            dataKey="tasksClosedMonth"
            name="Tasks fechadas"
            fill="hsl(var(--primary))"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
