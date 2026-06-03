import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Invalid credentials");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        });

        if (!user || !user.password) {
          throw new Error("User not found");
        }

        const isPasswordValid = await bcrypt.compare(credentials.password, user.password);

        if (!isPasswordValid) {
          if (credentials.password === user.password) {
             return {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              school: user.school,
            };
          }
          throw new Error("Invalid password");
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          school: user.school,
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = (user as any).id
        token.role = (user as any).role
        token.school = (user as any).school
        token.name = user.name
      }
      // Keep the JWT aligned with the current DB record after profile updates.
      if (trigger === 'update' && (token.id || token.sub)) {
        const fresh = await prisma.user.findUnique({
          where: { id: (token.id || token.sub) as string },
          select: { id: true, name: true, role: true, school: true }
        })
        if (fresh) {
          token.id = fresh.id
          token.name = fresh.name
          token.role = fresh.role
          token.school = fresh.school
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = token.name as string
        ;(session.user as any).role = token.role
        ;(session.user as any).school = token.school
        ;(session.user as any).id = token.id ?? token.sub
      }
      return session
    }
  },
  pages: {
    signIn: "/auth/signin",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
