import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./db";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "MEMBER";
    } & DefaultSession["user"];
  }
}

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(raw) {
        const parsed = credsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
        if (!user || !user.active) return null;
        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role: "ADMIN" | "MEMBER" }).role;
        token.name = (user as { name?: string | null }).name ?? null;
        token.email = (user as { email?: string | null }).email ?? null;
      }
      if (trigger === "update") {
        // session.update({ name: "..." }) chega aqui como `session` param
        const updates = session as { name?: string; email?: string } | undefined;
        if (updates?.name) token.name = updates.name;
        if (updates?.email) token.email = updates.email;
        // Se caller não mandou valor, revalida do banco
        if (!updates?.name && !updates?.email && token.id) {
          const fresh = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { name: true, email: true, role: true },
          });
          if (fresh) {
            token.name = fresh.name;
            token.email = fresh.email;
            token.role = fresh.role;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "ADMIN" | "MEMBER";
        if (token.name != null) session.user.name = token.name as string;
        if (token.email != null) session.user.email = token.email as string;
      }
      return session;
    },
    authorized({ auth, request }) {
      const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");
      const isApiAdmin = request.nextUrl.pathname.startsWith("/api/admin");
      if (isAdminRoute || isApiAdmin) {
        return auth?.user?.role === "ADMIN";
      }
      const isProtected =
        request.nextUrl.pathname.startsWith("/dashboard") ||
        request.nextUrl.pathname === "/";
      if (isProtected) return !!auth?.user;
      return true;
    },
  },
});
