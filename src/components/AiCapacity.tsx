import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCapacity } from "@/lib/capacity.functions";
import type { CapacityView } from "@/services/aiProvider.server";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/50 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-lg font-semibold">{value}</p>
    </div>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function AiCapacity() {
  const [view, setView] = useState<CapacityView | null>(null);
  const read = useServerFn(getCapacity);

  useEffect(() => {
    let active = true;
    read()
      .then((v) => {
        if (active) setView(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [read]);

  return (
    <section className="mt-5 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h2 className="font-display text-lg font-semibold">AI capacity</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Resume analysis, interviews and reports run on your own free AI keys, spread across them. Nothing here is
        charged to this workspace.
      </p>

      {view && view.keysConnected > 0 ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Keys connected" value={String(view.keysConnected)} />
            <Stat label="Allowances open" value={`${view.pairsOpen} / ${view.pairsTotal}`} />
            <Stat label="Requests used today" value={String(view.requestsToday)} />
            <Stat label="Interviews left" value={`~${view.estimatedInterviewsLeft}`} />
          </div>

          {view.message ? (
            <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              {view.message}
            </p>
          ) : null}

          {view.nextResetAt ? (
            <p className="mt-3 text-xs text-muted-foreground">The next allowance returns {when(view.nextResetAt)}.</p>
          ) : null}

          <ul className="mt-4 space-y-1.5">
            {view.models.map((m) => (
              <li key={m.model} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-mono text-xs">{m.model}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    m.openKeys ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {m.openKeys ? `${m.openKeys} of ${m.totalKeys} keys open` : "used up today"}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          {view ? "No AI keys are connected yet." : "Checking today's capacity…"}
        </p>
      )}
    </section>
  );
}
