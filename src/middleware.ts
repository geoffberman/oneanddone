import { auth } from "@/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isOnAuthPage =
    req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/register") ||
    req.nextUrl.pathname.startsWith("/forgot-password") ||
    req.nextUrl.pathname.startsWith("/reset-password");
  const isOnApiAuth = req.nextUrl.pathname.startsWith("/api/auth");
  const isOnApiRegister = req.nextUrl.pathname.startsWith("/api/register");
  const isOnApiPassword = req.nextUrl.pathname.startsWith("/api/forgot-password") || req.nextUrl.pathname.startsWith("/api/reset-password");
  const isOnCronApi = req.nextUrl.pathname.startsWith("/api/cron");
  const isOnAdminApi = req.nextUrl.pathname.startsWith("/api/admin");
  const isOnLandingPage = req.nextUrl.pathname === "/";

  // Allow public routes
  if (isOnApiAuth || isOnApiRegister || isOnApiPassword || isOnCronApi || isOnAdminApi || isOnLandingPage) {
    return;
  }

  // Redirect logged-in users away from auth pages
  if (isOnAuthPage && isLoggedIn) {
    return Response.redirect(new URL("/dashboard", req.nextUrl));
  }

  // Redirect unauthenticated users to login
  if (!isLoggedIn && !isOnAuthPage) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)",
  ],
};
