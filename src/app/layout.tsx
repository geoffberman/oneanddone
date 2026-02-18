import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "One and Done Golf",
  description:
    "Pick one PGA Tour golfer per week. Use them once, track your earnings, compete with friends.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker'in navigator){navigator.serviceWorker.getRegistrations().then(function(r){for(var s of r)s.unregister();})}`,
          }}
        />
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
