"use client";

export default function MembersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-md space-y-4 py-12 text-center">
      <h2 className="text-xl font-bold text-red-600">Something went wrong</h2>
      <p className="text-sm text-neutral-600">{error.message}</p>
      {error.digest && (
        <p className="font-mono text-xs text-neutral-400">
          Digest: {error.digest}
        </p>
      )}
      <button
        onClick={reset}
        className="rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
      >
        Try again
      </button>
    </div>
  );
}
