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
import { Search, Check, X, AlertCircle } from "lucide-react";

interface FieldEntry {
  fieldId: number;
  golferId: number;
  firstName: string;
  lastName: string;
  country: string | null;
  photoUrl: string | null;
  isWithdrawn: boolean;
  isUsed: boolean;
}

interface PickSelectionClientProps {
  gameId: number;
  tournamentId: number;
  field: FieldEntry[];
  existingPick: {
    primaryGolferId: number;
    alternateGolferId: number | null;
  } | null;
  isLocked: boolean;
}

export function PickSelectionClient({
  gameId,
  tournamentId,
  field,
  existingPick,
  isLocked,
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
      await submitPick(gameId, tournamentId, primaryId, alternateId);
      toast.success("Pick submitted successfully!");
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

  return (
    <div className="space-y-4">
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

      {/* Golfer List */}
      <div className="space-y-1">
        {filteredField.map((golfer) => {
          const isPrimary = golfer.golferId === primaryId;
          const isAlternate = golfer.golferId === alternateId;
          const isDisabled =
            golfer.isWithdrawn || golfer.isUsed || isLocked;

          return (
            <button
              key={golfer.golferId}
              onClick={() => !isDisabled && selectGolfer(golfer.golferId)}
              disabled={isDisabled}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${
                isPrimary
                  ? "bg-green-50 ring-1 ring-green-300"
                  : isAlternate
                    ? "bg-blue-50 ring-1 ring-blue-300"
                    : isDisabled
                      ? "cursor-not-allowed opacity-50"
                      : "hover:bg-neutral-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <div>
                  <span className="text-sm font-medium">
                    {golfer.firstName} {golfer.lastName}
                  </span>
                  {golfer.country && (
                    <span className="ml-2 text-xs text-neutral-400">
                      {golfer.country}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {golfer.isUsed && (
                  <Badge variant="secondary" className="text-xs">
                    Already Used
                  </Badge>
                )}
                {golfer.isWithdrawn && (
                  <Badge variant="destructive" className="text-xs">
                    WD
                  </Badge>
                )}
                {isPrimary && (
                  <Badge variant="success" className="text-xs">
                    <Check className="mr-1 h-3 w-3" />
                    Primary
                  </Badge>
                )}
                {isAlternate && (
                  <Badge className="bg-blue-100 text-xs text-blue-800">
                    <Check className="mr-1 h-3 w-3" />
                    Alternate
                  </Badge>
                )}
              </div>
            </button>
          );
        })}

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
            <DialogTitle>Confirm Your Pick</DialogTitle>
            <DialogDescription>
              Once the tournament starts, your pick will be locked.
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
    </div>
  );
}
