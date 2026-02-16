import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-green-50 to-white">
      <div className="mx-auto max-w-2xl px-4 text-center">
        <div className="mb-8">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-green-600 text-3xl font-bold text-white shadow-lg">
            1&amp;D
          </div>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">
            One and Done Golf
          </h1>
          <p className="text-lg text-neutral-600">
            Pick one PGA Tour golfer each week. Once you use a golfer, they are
            done for the season. Track your earnings and compete with friends on
            the leaderboard.
          </p>
        </div>

        <div className="mb-12 grid gap-4 text-left sm:grid-cols-3">
          <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-2xl font-bold text-green-600">1</div>
            <h3 className="mb-1 font-semibold">Pick a Golfer</h3>
            <p className="text-sm text-neutral-500">
              Choose one golfer from the tournament field each week, plus an
              alternate.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-2xl font-bold text-green-600">2</div>
            <h3 className="mb-1 font-semibold">Earn Prize Money</h3>
            <p className="text-sm text-neutral-500">
              Your golfer&apos;s tournament earnings are added to your season
              total.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-2xl font-bold text-green-600">3</div>
            <h3 className="mb-1 font-semibold">Climb the Board</h3>
            <p className="text-sm text-neutral-500">
              Compete against friends to see who picks the best golfers all
              season.
            </p>
          </div>
        </div>

        <Button asChild size="lg" className="bg-green-600 hover:bg-green-700">
          <Link href="/login">Get Started</Link>
        </Button>
      </div>
    </div>
  );
}
