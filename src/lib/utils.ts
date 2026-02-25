import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Returns the effective lock time for picks. Uses firstTeeTime when available.
// Falls back to startDate at noon UTC — startDate is stored as midnight UTC,
// which is 4 PM PST the evening before; noon UTC keeps the fallback on the
// actual start day at a reasonable morning hour (4 AM PST / 7 AM EST).
export function getTournamentLockTime(tournament: {
  firstTeeTime: Date | string | null;
  startDate: Date | string;
}): Date {
  if (tournament.firstTeeTime) return new Date(tournament.firstTeeTime);
  const d = new Date(tournament.startDate);
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

// Format a picks deadline with time and Pacific timezone, e.g. "February 19 at 6:00 AM PST"
export function formatDeadline(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const datePart = d.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "long",
    day: "numeric",
  });
  const timePart = d.toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
  return `${datePart} at ${timePart}`;
}
