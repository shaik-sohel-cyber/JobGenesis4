const STYLES: Record<string, { label: string; className: string }> = {
  uploaded: { label: "Uploaded", className: "bg-secondary text-secondary-foreground" },
  processing: { label: "Analyzing", className: "bg-accent/15 text-accent" },
  completed: { label: "Analyzed", className: "bg-success/15 text-success" },
  failed: { label: "Failed", className: "bg-destructive/12 text-destructive" },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? {
    label: status,
    className: "bg-secondary text-secondary-foreground",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style.className}`}
    >
      {style.label}
    </span>
  );
}
