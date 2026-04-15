"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  BarChart3,
  Settings,
  Users,
  Server,
  Plug,
  LogOut,
  Menu,
  X,
  Activity,
  Target,
  ShoppingBag,
  Sparkles,
  UserCircle,
  Package,
  ClipboardList,
  ChevronDown,
  ListChecks,
  Bell,
  Megaphone,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Brand } from "./brand";
import { NotificationBell } from "./notification-bell";
import { Avatar } from "@/components/ui/avatar";
import { CoinBalance } from "@/components/game/coin-balance";
import { UserDataProvider, useUserData } from "@/components/providers/user-data";

interface ShellProps {
  user: { id: string; name: string; email: string; role: "ADMIN" | "MEMBER" };
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const memberItems: NavItem[] = [
  { href: "/dashboard", label: "Painel", icon: BarChart3 },
  { href: "/dashboard/produtividade", label: "Produtividade", icon: Activity },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/metas", label: "Minhas Metas", icon: Target },
  { href: "/loja", label: "Loja", icon: ShoppingBag },
  { href: "/notificacoes", label: "Notificações", icon: Bell },
  { href: "/perfil", label: "Perfil", icon: UserCircle },
];

const adminGroups: NavGroup[] = [
  {
    label: "Equipe",
    items: [
      { href: "/mural", label: "Mural de performance", icon: Sparkles },
      { href: "/admin/users", label: "Usuários", icon: Users },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { href: "/admin/goals", label: "Metas", icon: Target },
      { href: "/admin/loja/itens", label: "Itens da Loja", icon: Package },
    ],
  },
  {
    label: "Operação",
    items: [
      { href: "/admin/loja/pedidos", label: "Pedidos da Loja", icon: ClipboardList },
      { href: "/admin/notifications", label: "Enviar Aviso", icon: Megaphone },
      { href: "/admin/zabbix", label: "Servidores Zabbix", icon: Server },
      { href: "/admin/jobs", label: "Execuções", icon: Activity },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/admin/config", label: "Configuração", icon: Settings },
      { href: "/admin/integrations", label: "Integrações", icon: Plug },
    ],
  },
];

export function AppShell({ user, children }: ShellProps) {
  return (
    <UserDataProvider>
      <ShellInner user={user}>{children}</ShellInner>
    </UserDataProvider>
  );
}

function ShellInner({ user, children }: ShellProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { coins } = useUserData();

  const flatItems = [
    ...memberItems,
    ...(user.role === "ADMIN" ? adminGroups.flatMap((g) => g.items) : []),
  ];
  // Match mais ESPECÍFICO vence (longest prefix) — evita /dashboard e
  // /dashboard/produtividade ficarem ambos ativos ao mesmo tempo.
  const activeHref = flatItems
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .map((i) => i.href)
    .sort((a, b) => b.length - a.length)[0];
  const activeItem = flatItems.find((i) => i.href === activeHref);

  return (
    <div className="flex min-h-screen surface-soft">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-card border-r transition-transform lg:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <SidebarContent
          memberItems={memberItems}
          adminGroups={user.role === "ADMIN" ? adminGroups : []}
          pathname={pathname}
          activeHref={activeHref}
          user={user}
          onNavigate={() => setOpen(false)}
        />
      </aside>

      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-card border-r">
        <SidebarContent
          memberItems={memberItems}
          adminGroups={user.role === "ADMIN" ? adminGroups : []}
          pathname={pathname}
          activeHref={activeHref}
          user={user}
        />
      </aside>

      {open && (
        <button
          type="button"
          aria-label="fechar menu"
          className="fixed inset-0 z-40 bg-foreground/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/85 backdrop-blur px-4 lg:px-6">
          <button
            type="button"
            className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
            onClick={() => setOpen(!open)}
            aria-label={open ? "fechar menu" : "abrir menu"}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <h1 className="text-base font-semibold text-foreground flex-1 truncate">
            {activeItem?.label ?? ""}
          </h1>
          <NotificationBell />
          <CoinBalance coins={coins} size="sm" />
          <Avatar userId={user.id} name={user.name} size={32} />
        </header>
        <main className="flex-1 p-4 lg:p-6 animate-fade-in">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  memberItems,
  adminGroups,
  pathname,
  activeHref,
  user,
  onNavigate,
}: {
  memberItems: NavItem[];
  adminGroups: NavGroup[];
  pathname: string;
  activeHref?: string;
  user: { id: string; name: string; email: string; role: "ADMIN" | "MEMBER" };
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex h-16 items-center justify-center px-4 border-b">
        <Brand height={32} />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {memberItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            pathname={pathname}
            activeHref={activeHref}
            onNavigate={onNavigate}
          />
        ))}

        {adminGroups.map((group) => (
          <NavGroupSection
            key={group.label}
            group={group}
            pathname={pathname}
            activeHref={activeHref}
            onNavigate={onNavigate}
          />
        ))}

        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-2 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </nav>

      <div className="border-t p-3 flex items-center gap-2">
        <Avatar userId={user.id} name={user.name} size={32} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium truncate">{user.name}</p>
          <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
        </div>
      </div>
    </>
  );
}

function NavLink({
  item,
  pathname,
  activeHref,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  activeHref?: string;
  onNavigate?: () => void;
}) {
  const active = activeHref === item.href;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <item.icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

function NavGroupSection({
  group,
  pathname,
  activeHref,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  activeHref?: string;
  onNavigate?: () => void;
}) {
  const containsActive = group.items.some((i) => i.href === activeHref);
  const storageKey = `nav-group:${group.label}`;
  const [open, setOpen] = useState<boolean>(true);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    if (saved !== null) setOpen(saved === "1");
    else setOpen(containsActive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem(storageKey, next ? "1" : "0");
      }
      return next;
    });
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-foreground"
      >
        <span>{group.label}</span>
        <ChevronDown
          className={cn("h-3 w-3 transition-transform", open ? "rotate-0" : "-rotate-90")}
        />
      </button>
      {open && (
        <div className="mt-1 space-y-0.5">
          {group.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              activeHref={activeHref}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
