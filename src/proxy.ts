import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

import { getHomePathForRole, isCoreWorkflowRole, isPmacSystemRole } from "@/lib/roles";
import { canCoordinatorAccessPmacPath } from "@/lib/pmacRouteAccess";

export default withAuth(
  async function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;
    const role = typeof token?.role === "string" ? token.role : null;
    const homePath = getHomePathForRole(role);

    // UX shortcut only: server reads/actions also check the current database flag.
    // Always leave profile and auth endpoints available for recovery/sign-out.
    if (token?.mustChangePassword && path !== "/profile" && !path.startsWith("/api/auth")) {
      return NextResponse.redirect(new URL("/profile", req.url));
    }

    // Preserve old links without allowing public storage to bypass record access.
    if (path.startsWith('/uploads/pmac/')) {
      const download = new URL('/api/pmac/attachments/download', req.url);
      download.searchParams.set('legacyPath', path);
      return NextResponse.rewrite(download);
    }

    // Redirect to home if already logged in and trying to access signin
    if (path.startsWith("/auth/signin") && token) {
      return NextResponse.redirect(new URL(homePath, req.url));
    }

    // Role-based access control
    if (path.startsWith("/new-request") && token?.role !== "SECRETARY" && token?.role !== "ICT_DIRECTOR") {
      return NextResponse.redirect(new URL(homePath, req.url));
    }

    if ((path.startsWith("/requests") || path.startsWith("/calendar")) && !isCoreWorkflowRole(role)) {
      return NextResponse.redirect(new URL(homePath, req.url));
    }

    if (path.startsWith("/admin") && token?.role !== "ICT_DIRECTOR") {
      return NextResponse.redirect(new URL(homePath, req.url));
    }

    if (path.startsWith("/analytics") && token?.role !== "CMAC_COORDINATOR" && token?.role !== "ICT_DIRECTOR") {
      return NextResponse.redirect(new URL(homePath, req.url));
    }

    if (path.startsWith("/logs") && token?.role !== "CMAC_COORDINATOR") {
      return NextResponse.redirect(new URL(homePath, req.url));
    }

    if (path.startsWith("/coordinator/pmac") && token?.role !== "CMAC_COORDINATOR") {
      return NextResponse.redirect(new URL(homePath, req.url));
    }

    if (
      role === "CMAC_COORDINATOR"
      && canCoordinatorAccessPmacPath(path)
    ) {
      return NextResponse.next();
    }

    if (path.startsWith("/pmac")) {
      if (!isPmacSystemRole(role)) {
        return NextResponse.redirect(new URL(homePath, req.url));
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
