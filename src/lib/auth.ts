import { hasUserSecurityFields, prisma } from "@/lib/prisma"
import { sanitizeEmailAddress, sanitizePasswordInput } from "@/lib/sanitization"
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

        let email: string
        let password: string

        try {
          email = sanitizeEmailAddress(credentials.email)
          password = sanitizePasswordInput(credentials.password, {
            fieldName: 'Password',
            required: true,
            maxLength: 255,
          })
        } catch {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            email: true,
            password: true,
            role: true,
            school: true,
            isActive: true,
            pmacMemberId: true,
            ...(hasUserSecurityFields() ? { mustChangePassword: true } : {}),
          }
        })

        if (!user || !user.password || !user.isActive) {
          return null
        }

        const isPasswordValid = await bcrypt.compare(password, user.password)

        if (!isPasswordValid) {
          return null
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          school: user.school,
          isActive: user.isActive,
          pmacMemberId: user.pmacMemberId,
          mustChangePassword: hasUserSecurityFields() ? user.mustChangePassword : false,
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
        token.isActive = user.isActive
        token.pmacMemberId = user.pmacMemberId
        token.mustChangePassword = user.mustChangePassword
      }
      // Keep the JWT aligned with the current DB record after profile updates.
      if (trigger === 'update' && (token.id || token.sub)) {
        const fresh = await prisma.user.findUnique({
          where: { id: (token.id || token.sub) as string },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            school: true,
            isActive: true,
            pmacMemberId: true,
            ...(hasUserSecurityFields() ? { mustChangePassword: true } : {}),
          }
        })
        if (fresh) {
          token.id = fresh.id
          token.email = fresh.email
          token.name = fresh.name
          token.role = fresh.role
          token.school = fresh.school
          token.isActive = fresh.isActive
          token.pmacMemberId = fresh.pmacMemberId
          token.mustChangePassword = hasUserSecurityFields() ? fresh.mustChangePassword : false
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
        session.user.isActive = token.isActive ?? true
        session.user.pmacMemberId = token.pmacMemberId ?? null
        session.user.mustChangePassword = token.mustChangePassword ?? false
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
