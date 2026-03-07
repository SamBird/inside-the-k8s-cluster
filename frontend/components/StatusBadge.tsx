interface StatusBadgeProps {
  tone: "ok" | "warn" | "bad" | "neutral";
  label: string;
}

export function StatusBadge({ tone, label }: StatusBadgeProps) {
  return <span className={`status-badge status-${tone}`}>{label}</span>;
}
