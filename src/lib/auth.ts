import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { type NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"

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
          return null
        }

        const email = credentials.email.trim().toLowerCase()
        const user = await prisma.user.findUnique({
          where: { email }
        })

        if (!user || !user.password) {
          return null
        }

        const isPasswordValid = await bcrypt.compare(credentials.password, user.password)

        if (!isPasswordValid) {
          return null
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          school: user.school,
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.role = user.role
        token.school = user.school
        token.name = user.name
      }
      // Keep the JWT aligned with the current DB record after profile updates.
      if (trigger === 'update' && (token.id || token.sub)) {
        const fresh = await prisma.user.findUnique({
          where: { id: (token.id || token.sub) as string },
          select: { id: true, email: true, name: true, role: true, school: true }
        })
        if (fresh) {
          token.id = fresh.id
          token.email = fresh.email
          token.name = fresh.name
          token.role = fresh.role
          token.school = fresh.school
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.id && token.role) {
        session.user.email = token.email
        session.user.name = token.name as string
        session.user.role = token.role
        session.user.school = token.school ?? null
        session.user.id = token.id
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
}
