import { auth } from "@/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isOnAuthPage =
    req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/register");
  const isOnApiAuth = req.nextUrl.pathname.startsWith("/api/auth");
  const isOnApiRegister = req.nextUrl.pathname.startsWith("/api/register");
  const isOnCronApi = req.nextUrl.pathname.startsWith("/api/cron");
  const isOnLandingPage = req.nextUrl.pathname === "/";

  // Allow public routes
  if (isOnApiAuth || isOnApiRegister || isOnCronApi || isOnLandingPage) {
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
