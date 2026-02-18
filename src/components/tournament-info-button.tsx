"use client";

import { useState, useCallback } from "react";
import { Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface YearResult {
  year: number;
  results: {
    position: number;
    firstName: string;
    lastName: string;
    totalScoreToPar: number;
    earnings: number;
  }[];
}

function formatEarnings(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(0)}K`;
  }
  return `$${amount.toLocaleString()}`;
}

function formatScore(score: number): string {
  if (score === 0) return "E";
  return score > 0 ? `+${score}` : `${score}`;
}

export function TournamentInfoButton({
  tournamentName,
}: {
  tournamentName: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<YearResult[] | null>(null);

  const fetchHistory = useCallback(async () => {
    if (data) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/golf/tournament-history?name=${encodeURIComponent(tournamentName)}`
      );
      if (res.ok) {
        const json = await res.json();
        setData(json.years);
      } else {
        setData([]);
      }
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [tournamentName, data]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          fetchHistory();
        }}
        className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
        title="Past results"
      >
        <Info className="h-5 w-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">
              Past Results — {tournamentName}
            </DialogTitle>
          </DialogHeader>

          {loading && (
            <p className="py-6 text-center text-sm text-neutral-500">
              Loading...
            </p>
          )}

          {!loading && data && data.length === 0 && (
            <p className="py-6 text-center text-sm text-neutral-500">
              No historical data available
            </p>
          )}

          {!loading &&
            data &&
            data.length > 0 &&
            data.map((year) => (
              <div key={year.year} className="space-y-1">
                <h3 className="text-sm font-semibold text-neutral-700">
                  {year.year}
                </h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-neutral-400">
                      <th className="w-8 py-1">Pos</th>
                      <th className="py-1">Player</th>
                      <th className="py-1 text-right">Score</th>
                      <th className="py-1 text-right">Earnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {year.results.map((r, i) => (
                      <tr key={i} className="border-b border-neutral-100">
                        <td className="py-1 font-medium">{r.position}</td>
                        <td className="py-1">
                          {r.firstName} {r.lastName}
                        </td>
                        <td className="py-1 text-right">
                          {formatScore(r.totalScoreToPar)}
                        </td>
                        <td className="py-1 text-right">
                          {formatEarnings(r.earnings)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </DialogContent>
      </Dialog>
    </>
  );
}
