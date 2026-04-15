import {
  Trophy,
  ShieldCheck,
  Target,
  Flame,
  Rocket,
  Sparkles,
  Star,
  Crown,
  Medal,
  Award,
  Zap,
  Gem,
  Heart,
  Check,
  TrendingUp,
  Activity,
  Clock,
  Users,
  Calendar,
  MessageSquare,
  Bookmark,
  ThumbsUp,
  Eye,
  Lightbulb,
} from "lucide-react";

import type { ComponentType } from "react";

type IconComp = ComponentType<{ className?: string }>;

/** Ícones lucide-react curados pro catálogo de metas. */
export const LUCIDE_ICONS: Record<string, IconComp> = {
  trophy: Trophy,
  "shield-check": ShieldCheck,
  target: Target,
  flame: Flame,
  rocket: Rocket,
  sparkles: Sparkles,
  star: Star,
  crown: Crown,
  medal: Medal,
  award: Award,
  zap: Zap,
  gem: Gem,
  heart: Heart,
  check: Check,
  "trending-up": TrendingUp,
  activity: Activity,
  clock: Clock,
  users: Users,
  calendar: Calendar,
  message: MessageSquare,
  bookmark: Bookmark,
  "thumbs-up": ThumbsUp,
  eye: Eye,
  lightbulb: Lightbulb,
};

/** Lista de emojis relevantes pra metas/marcos. */
export const EMOJIS = [
  "🏆",
  "🎯",
  "⭐",
  "🔥",
  "💎",
  "🚀",
  "⚡",
  "👑",
  "🥇",
  "🥈",
  "🥉",
  "💯",
  "🎖️",
  "🏅",
  "✨",
  "🌟",
  "💪",
  "🧠",
  "🎉",
  "🎊",
  "🎁",
  "💰",
  "💵",
  "📈",
  "📊",
  "🔑",
  "🛡️",
  "⚔️",
  "🏹",
  "🧩",
  "🎮",
  "🎲",
  "🍀",
  "☄️",
  "🌈",
  "🎨",
  "📝",
  "📌",
  "🔔",
  "📣",
  "💡",
  "🧭",
  "⏱️",
  "🏁",
  "🤝",
  "🙌",
  "👏",
  "🙏",
  "❤️",
  "🧡",
  "💚",
  "💙",
  "💜",
];

/**
 * Retorna o componente/conteúdo de render para o valor de ícone guardado no banco.
 * Formato aceito: `"lucide:<name>"`, `"emoji:<char>"` ou valor legado (só nome lucide).
 */
export function parseIconValue(value: string | null | undefined): {
  kind: "lucide" | "emoji";
  value: string;
} {
  if (!value) return { kind: "lucide", value: "trophy" };
  if (value.startsWith("emoji:")) {
    return { kind: "emoji", value: value.slice(6) };
  }
  if (value.startsWith("lucide:")) {
    return { kind: "lucide", value: value.slice(7) };
  }
  return { kind: "lucide", value };
}

export function getLucideIcon(name: string): IconComp {
  return LUCIDE_ICONS[name] ?? Trophy;
}
