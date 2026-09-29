export function MilestoneBanner({ days }: { days: number }) {
  return (
    <div role="status" data-testid="streak-milestone" className="rounded-lg border bg-accent p-4">
      <strong>{days}-day milestone!</strong>
      <p>Your daily practice is adding up. Keep learning at your pace.</p>
    </div>
  );
}
