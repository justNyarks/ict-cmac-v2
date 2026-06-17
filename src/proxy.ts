import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

import {
  ZERO_TRUST_COOKIE_NAME,
  getZeroTrustRedirectPath,
  isPrivilegedRole,
  shouldEnforceZeroTrust,
  verifyZeroTrustToken,
} from "@/lib/zeroTrust";

export default withAuth(
  async function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;
    const role = typeof token?.role === "string" ? token.role : null;
    const userId = typeof token?.id === "string" ? token.id : typeof token?.sub === "string" ? token.sub : null;

    // Redirect to home if already logged in and trying to access signin
    if (path.startsWith("/auth/signin") && token) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    // Role-based access control
    if (path.startsWith("/new-request") && token?.role !== "SECRETARY" && token?.role !== "ICT_DIRECTOR") {
      return NextResponse.redirect(new URL("/", req.url));
    }

    if (path.startsWith("/admin") && token?.role !== "ICT_DIRECTOR") {
      return NextResponse.redirect(new URL("/", req.url));
    }

    if (path.startsWith("/analytics") && token?.role !== "CMAC_COORDINATOR" && token?.role !== "ICT_DIRECTOR") {
      return NextResponse.redirect(new URL("/", req.url));
    }

    if (path.startsWith("/logs") && token?.role !== "CMAC_COORDINATOR") {
      return NextResponse.redirect(new URL("/", req.url));
    }

    if (path.startsWith("/zero-trust") && !isPrivilegedRole(role)) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    if (shouldEnforceZeroTrust(role, path)) {
      const cookieValue = req.cookies.get(ZERO_TRUST_COOKIE_NAME)?.value;
      const isVerified = cookieValue ? await verifyZeroTrustToken(cookieValue, userId, role) : false;

      if (!isVerified) {
        const nextPath = `${path}${req.nextUrl.search}`;
        return NextResponse.redirect(new URL(getZeroTrustRedirectPath(nextPath), req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;
        if (path.startsWith("/auth/signin") || path.startsWith("/api/auth")) {
          return true;
        }
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
