"use client";

import { useState, useCallback } from "react";
import { Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface GolferYearResult {
  year: number;
  position: number;
  totalScoreToPar: number;
  earnings: number;
  madeCut: boolean;
}

function formatEarnings(amount: number): string {
  if (!amount) return "—";
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

function formatScore(score: number): string {
  if (score === 0) return "E";
  return score > 0 ? `+${score}` : `${score}`;
}

export function GolferInfoButton({
  golferId,
  golferName,
  tournamentName,
  iconClassName = "h-3.5 w-3.5",
}: {
  golferId: number;
  golferName: string;
  tournamentName: string;
  iconClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<GolferYearResult[] | null>(null);

  const fetchResults = useCallback(async () => {
    if (data) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        tournamentName,
        golferId: String(golferId),
      });
      const res = await fetch(`/api/golf/golfer-results?${params}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.results);
      } else {
        setData([]);
      }
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [golferId, tournamentName, data]);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
          fetchResults();
        }}
        className="rounded p-0.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
        title="Past results"
      >
        <Info className={iconClassName} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg">{golferName}</DialogTitle>
            <DialogDescription>Results at {tournamentName}</DialogDescription>
          </DialogHeader>

          {loading && (
            <p className="py-6 text-center text-sm text-neutral-500">
              Loading...
            </p>
          )}

          {!loading && data && data.length === 0 && (
            <p className="py-6 text-center text-sm text-neutral-500">
              No history at this tournament
            </p>
          )}

          {!loading && data && data.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-neutral-400">
                  <th className="py-1.5">Year</th>
                  <th className="py-1.5 text-right">Finish</th>
                  <th className="py-1.5 text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.year} className="border-b border-neutral-100">
                    <td className="py-1.5 font-medium">{r.year}</td>
                    <td className="py-1.5 text-right">
                      {!r.madeCut
                        ? "MC"
                        : r.position > 0
                          ? `T${r.position}`
                          : "—"}
                    </td>
                    <td className="py-1.5 text-right">
                      {formatScore(r.totalScoreToPar)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
