"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface NavProps {
  user: {
    name?: string | null;
    image?: string | null;
  };
}

export function Nav({ user }: NavProps) {
  const pathname = usePathname();

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-bold text-green-600"
          >
            <Image
              src="/golf-ball.svg"
              alt="One and Done"
              width={32}
              height={32}
              className="h-8 w-8"
            />
            <span className="hidden sm:inline">One and Done</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/dashboard"
              className={cn(
                "transition-colors hover:text-neutral-900",
                pathname === "/dashboard"
                  ? "font-medium text-neutral-900"
                  : "text-neutral-500"
              )}
            >
              Dashboard
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-neutral-600 sm:inline">
            {user.name}
          </span>
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.image || undefined} alt={user.name || ""} />
            <AvatarFallback className="text-xs">
              {user.name?.charAt(0)?.toUpperCase() || "?"}
            </AvatarFallback>
          </Avatar>
          <button
            onClick={() => {
              window.location.href = "/api/auth/signout";
            }}
            className="text-sm text-neutral-500 transition-colors hover:text-neutral-900"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
