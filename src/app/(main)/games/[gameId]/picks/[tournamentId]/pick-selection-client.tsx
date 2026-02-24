"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitPick } from "@/lib/actions/picks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, Check, X, AlertCircle, Info } from "lucide-react";

interface FieldEntry {
  fieldId: number;
  golferId: number;
  firstName: string;
  lastName: string;
  country: string | null;
  photoUrl: string | null;
  worldRanking: number | null;
  isWithdrawn: boolean;
  isUsed: boolean;
}

interface Member {
  userId: string;
  userName: string | null;
  userDisplayName: string | null;
}

interface PickSelectionClientProps {
  gameId: number;
  tournamentId: number;
  tournamentName: string;
  field: FieldEntry[];
  existingPick: {
    primaryGolferId: number;
    alternateGolferId: number | null;
  } | null;
  isLocked: boolean;
  isManager: boolean;
  targetUserId: string;
  members: Member[];
}

function GolferCard({
  golfer,
  primaryId,
  alternateId,
  isLocked,
  onSelect,
  onInfo,
}: {
  golfer: FieldEntry;
  primaryId: number | null;
  alternateId: number | null;
  isLocked: boolean;
  onSelect: (id: number) => void;
  onInfo: (golfer: FieldEntry) => void;
}) {
  const isPrimary = golfer.golferId === primaryId;
  const isAlternate = golfer.golferId === alternateId;
  const isDisabled = golfer.isWithdrawn || golfer.isUsed || isLocked;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !isDisabled && onSelect(golfer.golferId)}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !isDisabled) {
          e.preventDefault();
          onSelect(golfer.golferId);
        }
      }}
      className={`flex w-full flex-col rounded-lg border px-3 py-2 text-left transition-colors ${
        isPrimary
          ? "border-green-400 bg-green-50 ring-1 ring-green-300"
          : isAlternate
            ? "border-blue-400 bg-blue-50 ring-1 ring-blue-300"
            : isDisabled
              ? "cursor-not-allowed border-neutral-200 opacity-50"
              : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
      }`}
    >
      <div className="flex items-center gap-2">
        {golfer.worldRanking && (
          <span className="text-xs font-medium text-neutral-400">
            #{golfer.worldRanking}
          </span>
        )}
        <span className="truncate text-sm font-medium">
          {golfer.firstName} {golfer.lastName}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onInfo(golfer);
          }}
          className="ml-auto shrink-0 rounded p-0.5 text-neutral-300 transition-colors hover:text-neutral-500"
          title="Recent results"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {golfer.country && (
          <span className="text-xs text-neutral-400">{golfer.country}</span>
        )}
        {golfer.isUsed && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            Used
          </Badge>
        )}
        {golfer.isWithdrawn && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            WD
          </Badge>
        )}
        {isPrimary && (
          <Badge variant="success" className="text-[10px] px-1.5 py-0">
            <Check className="mr-0.5 h-2.5 w-2.5" />
            Primary
          </Badge>
        )}
        {isAlternate && (
          <Badge className="bg-blue-100 text-[10px] px-1.5 py-0 text-blue-800">
            <Check className="mr-0.5 h-2.5 w-2.5" />
            Alt
          </Badge>
        )}
      </div>
    </div>
  );
}

export function PickSelectionClient({
  gameId,
  tournamentId,
  tournamentName,
  field,
  existingPick,
  isLocked,
  isManager,
  targetUserId,
  members,
}: PickSelectionClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [primaryId, setPrimaryId] = useState<number | null>(
    existingPick?.primaryGolferId ?? null
  );
  const [alternateId, setAlternateId] = useState<number | null>(
    existingPick?.alternateGolferId ?? null
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectingSlot, setSelectingSlot] = useState<
    "primary" | "alternate"
  >("primary");
  const [infoGolfer, setInfoGolfer] = useState<FieldEntry | null>(null);
  const [infoResults, setInfoResults] = useState<
    {
      year: number;
      position: number;
      totalScoreToPar: number;
      earnings: number;
      madeCut: boolean;
    }[]
    | null
  >(null);
  const [infoLoading, setInfoLoading] = useState(false);

  function openGolferInfo(golfer: FieldEntry) {
    setInfoGolfer(golfer);
    setInfoResults(null);
    setInfoLoading(true);
    const params = new URLSearchParams({
      tournamentName,
      golferId: String(golfer.golferId),
    });
    fetch(`/api/golf/golfer-results?${params}`)
      .then((res) => (res.ok ? res.json() : { results: [] }))
      .then((data) => setInfoResults(data.results))
      .catch(() => setInfoResults([]))
      .finally(() => setInfoLoading(false));
  }

  const filteredField = field.filter((g) => {
    const name = `${g.firstName} ${g.lastName}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const primaryGolfer = field.find((g) => g.golferId === primaryId);
  const alternateGolfer = field.find((g) => g.golferId === alternateId);

  function selectGolfer(golferId: number) {
    if (isLocked) return;
    if (selectingSlot === "primary") {
      if (golferId === alternateId) setAlternateId(null);
      setPrimaryId(golferId);
      setSelectingSlot("alternate");
    } else {
      if (golferId === primaryId) return;
      setAlternateId(golferId);
    }
  }

  async function handleSubmit() {
    if (!primaryId) return;
    setSubmitting(true);
    try {
      await submitPick(gameId, tournamentId, primaryId, alternateId, targetUserId);
      toast.success(
        targetName
          ? `Pick submitted for ${targetName}!`
          : "Pick submitted successfully!"
      );
      setConfirmOpen(false);
      router.push(`/games/${gameId}`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to submit pick"
      );
    } finally {
      setSubmitting(false);
    }
  }

  const targetMember = members.find((m) => m.userId === targetUserId);
  const targetName = targetMember
    ? (targetMember.userDisplayName ?? targetMember.userName ?? "Member")
    : null;

  return (
    <div className="space-y-4">
      {/* Manager: member selector */}
      {isManager && members.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-center gap-3 py-3">
            <span className="shrink-0 text-sm font-medium text-amber-800">
              Picking for:
            </span>
            <select
              value={targetUserId}
              onChange={(e) => {
                router.push(
                  `/games/${gameId}/picks/${tournamentId}?for=${e.target.value}`
                );
              }}
              className="flex-1 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.userDisplayName ?? m.userName ?? m.userId}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      )}

      {/* Pick Slots */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card
          className={`cursor-pointer transition-colors ${
            selectingSlot === "primary"
              ? "border-green-500 ring-2 ring-green-200"
              : ""
          }`}
          onClick={() => !isLocked && setSelectingSlot("primary")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-neutral-500">
              Primary Pick
            </CardTitle>
          </CardHeader>
          <CardContent>
            {primaryGolfer ? (
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  {primaryGolfer.firstName} {primaryGolfer.lastName}
                </span>
                {!isLocked && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPrimaryId(null);
                      setSelectingSlot("primary");
                    }}
                    className="text-neutral-400 hover:text-neutral-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-neutral-400">
                Click a golfer below to select
              </p>
            )}
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-colors ${
            selectingSlot === "alternate"
              ? "border-blue-500 ring-2 ring-blue-200"
              : ""
          }`}
          onClick={() => !isLocked && setSelectingSlot("alternate")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-neutral-500">
              Alternate Pick
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alternateGolfer ? (
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  {alternateGolfer.firstName} {alternateGolfer.lastName}
                </span>
                {!isLocked && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAlternateId(null);
                    }}
                    className="text-neutral-400 hover:text-neutral-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-neutral-400">
                Optional backup if primary WDs
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Submit Button */}
      {!isLocked && primaryId && (
        <Button
          onClick={() => setConfirmOpen(true)}
          className="w-full bg-green-600 hover:bg-green-700"
          size="lg"
        >
          {existingPick ? "Update Pick" : "Submit Pick"}
        </Button>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <Input
          placeholder="Search golfers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Golfer List — grouped by tier */}
      <div className="space-y-4">
        {(() => {
          const tiers = [
            { label: "Top 20", min: 1, max: 20 },
            { label: "Ranked 21–50", min: 21, max: 50 },
            { label: "Ranked 51–100", min: 51, max: 100 },
            { label: "Ranked 100+", min: 101, max: 9998 },
            { label: "Unranked", min: 9999, max: 9999 },
          ];

          const hasAnyRanking = filteredField.some((g) => g.worldRanking);

          // If no rankings data, show flat grid
          if (!hasAnyRanking) {
            return (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {filteredField.map((golfer) => (
                  <GolferCard
                    key={golfer.golferId}
                    golfer={golfer}
                    primaryId={primaryId}
                    alternateId={alternateId}
                    isLocked={isLocked}
                    onSelect={selectGolfer}
                    onInfo={openGolferInfo}
                  />
                ))}
              </div>
            );
          }

          return tiers.map((tier) => {
            const golfers = filteredField.filter((g) => {
              const rank = g.worldRanking ?? 9999;
              return rank >= tier.min && rank <= tier.max;
            });
            if (golfers.length === 0) return null;
            return (
              <div key={tier.label}>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {tier.label}
                  </h3>
                  <span className="text-xs text-neutral-400">
                    ({golfers.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {golfers.map((golfer) => (
                    <GolferCard
                      key={golfer.golferId}
                      golfer={golfer}
                      primaryId={primaryId}
                      alternateId={alternateId}
                      isLocked={isLocked}
                      onSelect={selectGolfer}
                      onInfo={openGolferInfo}
                    />
                  ))}
                </div>
              </div>
            );
          });
        })()}

        {filteredField.length === 0 && (
          <div className="py-8 text-center text-sm text-neutral-500">
            {search
              ? "No golfers match your search"
              : "Tournament field not available yet"}
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {targetName ? `Confirm Pick for ${targetName}` : "Confirm Your Pick"}
            </DialogTitle>
            <DialogDescription>
              Once the tournament starts, picks will be locked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-green-50 p-3">
              <p className="text-xs font-medium text-green-700">
                Primary Pick
              </p>
              <p className="font-semibold">
                {primaryGolfer?.firstName} {primaryGolfer?.lastName}
              </p>
            </div>
            {alternateGolfer && (
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs font-medium text-blue-700">
                  Alternate
                </p>
                <p className="font-semibold">
                  {alternateGolfer.firstName} {alternateGolfer.lastName}
                </p>
              </div>
            )}
            {!alternateGolfer && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
                <p className="text-sm text-amber-700">
                  No alternate selected. If your primary pick withdraws before
                  round 1, you will not have a substitute.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-green-600 hover:bg-green-700"
            >
              {submitting ? "Submitting..." : "Confirm Pick"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Golfer Info Dialog */}
      <Dialog
        open={!!infoGolfer}
        onOpenChange={(open) => {
          if (!open) setInfoGolfer(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg">
              {infoGolfer?.firstName} {infoGolfer?.lastName}
            </DialogTitle>
            <DialogDescription>
              Results at {tournamentName}
            </DialogDescription>
          </DialogHeader>

          {infoLoading && (
            <p className="py-6 text-center text-sm text-neutral-500">
              Loading...
            </p>
          )}

          {!infoLoading && infoResults && infoResults.length === 0 && (
            <p className="py-6 text-center text-sm text-neutral-500">
              No history at this tournament
            </p>
          )}

          {!infoLoading && infoResults && infoResults.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-neutral-400">
                  <th className="py-1.5">Year</th>
                  <th className="py-1.5 text-right">Finish</th>
                  <th className="py-1.5 text-right">Score</th>
                  <th className="py-1.5 text-right">Earnings</th>
                </tr>
              </thead>
              <tbody>
                {infoResults.map((r) => (
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
                      {r.totalScoreToPar === 0
                        ? "E"
                        : r.totalScoreToPar > 0
                          ? `+${r.totalScoreToPar}`
                          : `${r.totalScoreToPar}`}
                    </td>
                    <td className="py-1.5 text-right">
                      {r.earnings >= 1_000_000
                        ? `$${(r.earnings / 1_000_000).toFixed(1)}M`
                        : r.earnings >= 1_000
                          ? `$${(r.earnings / 1_000).toFixed(0)}K`
                          : `$${r.earnings.toLocaleString()}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
