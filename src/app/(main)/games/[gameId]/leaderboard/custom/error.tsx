"use client";

export default function CustomLeaderboardError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6">
      <h2 className="mb-2 text-lg font-semibold text-red-800">
        Error loading Custom Leaderboards
      </h2>
      <p className="mb-1 text-sm text-red-700">{error.message}</p>
      {error.digest && (
        <p className="text-xs text-red-500">Digest: {error.digest}</p>
      )}
    </div>
  );
}
