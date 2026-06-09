import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

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

    if (path.startsWith("/logs") && token?.role !== "CMAC_COORDINATOR") {
      return NextResponse.redirect(new URL("/", req.url));
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
