import type { Role, School } from "@/types"
import type { DefaultSession, DefaultUser } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string
      role: Role
      school: School | null
    }
  }

  interface User extends DefaultUser {
    id: string
    role: Role
    school: School | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    role?: Role
    school?: School | null
    name?: string | null
  }
}
