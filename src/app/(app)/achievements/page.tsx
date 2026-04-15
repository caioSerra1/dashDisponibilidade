import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AchievementsList } from "@/components/game/achievements-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RenderIcon } from "@/components/ui/icon-picker";

export default async function AchievementsPage() {
  const session = await auth();
  const userId = session!.user.id;
  const [unlocked, catalog] = await Promise.all([
    prisma.userAchievement.findMany({
      where: { userId },
      include: { achievement: true },
      orderBy: { unlockedAt: "desc" },
    }),
    prisma.achievement.findMany({ orderBy: { xp: "asc" } }),
  ]);

  const unlockedMap = new Map(unlocked.map((u) => [u.achievement.code, u]));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Desbloqueadas ({unlocked.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <AchievementsList
            items={unlocked.map((u) => ({
              code: u.achievement.code,
              name: u.achievement.name,
              description: u.achievement.description,
              icon: u.achievement.icon,
              xp: u.achievement.xp,
              unlockedAt: u.unlockedAt.toISOString(),
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {catalog.map((a) => {
              const got = unlockedMap.has(a.code);
              return (
                <div
                  key={a.code}
                  className={`flex items-start gap-3 rounded-md border p-3 ${
                    got ? "bg-primary/5" : "opacity-60"
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary text-xl">
                    <RenderIcon value={a.icon} className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{a.description}</p>
                    <p className="text-xs mt-1">+{a.xp} XP</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
