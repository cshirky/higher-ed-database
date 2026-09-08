"use client";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-full flex flex-col items-center justify-center gap-4 p-12">
        <h2 className="text-lg font-semibold">Something went wrong!</h2>
        <pre className="max-w-2xl overflow-auto whitespace-pre-wrap text-sm text-red-600">
          {error.message}
          {error.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>
        <button
          onClick={() => unstable_retry()}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
