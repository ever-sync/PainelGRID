import type { ConnectionStatus } from "./shared";

export function ConnectionDot({ status }: { status: ConnectionStatus }) {
  const color =
    status === "online"
      ? "#10b981"
      : status === "stale"
        ? "#f59e0b"
        : "#ef4444";
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {status !== "online" && (
        <span
          className="absolute inset-0 animate-ping rounded-full opacity-75"
          style={{ backgroundColor: color }}
        />
      )}
      <span
        className="relative inline-flex h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
      />
    </span>
  );
}
