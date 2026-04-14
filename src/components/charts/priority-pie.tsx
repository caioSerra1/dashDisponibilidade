"use client";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts";

const COLORS: Record<string, string> = {
  Urgente: "#dc2626",
  Alta: "#ea580c",
  Normal: "#2563eb",
  Baixa: "#94a3b8",
};

interface Point {
  name: string;
  value: number;
}

export function PriorityPieChart({ data }: { data: Point[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2}>
            {data.map((p, i) => (
              <Cell key={i} fill={COLORS[p.name] ?? "#94a3b8"} />
            ))}
          </Pie>
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
