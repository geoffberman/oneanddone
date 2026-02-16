import { auth } from "@/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isOnLoginPage = req.nextUrl.pathname.startsWith("/login");
  const isOnApiAuth = req.nextUrl.pathname.startsWith("/api/auth");
  const isOnCronApi = req.nextUrl.pathname.startsWith("/api/cron");
  const isOnLandingPage = req.nextUrl.pathname === "/";

  // Allow public routes
  if (isOnApiAuth || isOnCronApi || isOnLandingPage) {
    return;
  }

  // Redirect logged-in users away from login page
  if (isOnLoginPage && isLoggedIn) {
    return Response.redirect(new URL("/dashboard", req.nextUrl));
  }

  // Redirect unauthenticated users to login
  if (!isLoggedIn && !isOnLoginPage) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
