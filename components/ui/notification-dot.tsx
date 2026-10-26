export function NotificationDot({ label }: { label: string }) {
  return (
    <span
      role="status"
      className="pointer-events-none absolute top-1 right-1 size-2 rounded-full bg-red-500 ring-2 ring-surface"
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}
