'use client';
export default function Error({ reset }: { reset(): void }) {
  return (
    <div role="alert" className="p-6">
      <p>Settings could not be loaded.</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
