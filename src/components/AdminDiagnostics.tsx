import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { services } from "@/services";
import {
  providerNames,
  voiceConfig,
  type EnabledProviders,
  type SttProviderId,
  type TtsProviderId,
} from "@/services/voiceEngine/voiceConfig";

function isEnabledProviders(value: unknown): value is EnabledProviders {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const tts = candidate["tts"];
  const stt = candidate["stt"];
  if (!tts || typeof tts !== "object" || !stt || typeof stt !== "object") return false;
  return (
    [...voiceConfig.ttsOrder].every(
      (id) => typeof (tts as Record<string, unknown>)[id] === "boolean",
    ) &&
    [...voiceConfig.sttOrder].every(
      (id) => typeof (stt as Record<string, unknown>)[id] === "boolean",
    )
  );
}

type ProviderRow = { id: string; name: string; enabled: boolean };

export function AdminDiagnostics() {
  const [enabled, setEnabled] = useState<EnabledProviders | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const token = data.session?.access_token;
      if (!token) throw new Error("No authenticated session.");

      const response = await fetch("/api/voice/providers", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok)
        throw new Error(`Provider diagnostics request failed (${response.status}).`);
      const result: unknown = await response.json();
      if (!isEnabledProviders(result)) throw new Error("Invalid provider diagnostics response.");
      if (active) {
        setEnabled(result);
        setFailed(false);
      }
    })().catch((error: unknown) => {
      console.error("[admin] Failed to load voice provider diagnostics", error);
      if (active) setFailed(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const groups: { title: string; rows: ProviderRow[] }[] = [
    {
      title: "Interviewer voice",
      rows: voiceConfig.ttsOrder.map((id: TtsProviderId) => ({
        id,
        name: providerNames[id],
        enabled: enabled?.tts[id] ?? false,
      })),
    },
    {
      title: "Speech-to-text",
      rows: voiceConfig.sttOrder.map((id: SttProviderId) => ({
        id,
        name: providerNames[id],
        enabled: enabled?.stt[id] ?? false,
      })),
    },
  ];

  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-lg font-semibold">Internal feature availability</h2>
        <ul className="mt-4 space-y-2.5">
          {services.map((service) => (
            <li key={service.key} className="flex items-start justify-between gap-3 text-sm">
              <div>
                <p className="font-medium">{service.name}</p>
                <p className="text-xs text-muted-foreground">{service.summary}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  service.status === "available"
                    ? "bg-success/15 text-success"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {service.status === "available" ? "Available" : "Planned"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-lg font-semibold">Voice provider diagnostics</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Provider configuration status only; API keys and secret values are never displayed.
        </p>
        {failed ? (
          <p className="mt-4 text-sm text-destructive">
            Unable to load voice provider diagnostics.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.title} className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.title}
              </p>
              <ul className="mt-2 space-y-1.5">
                {group.rows.map((provider) => (
                  <li key={provider.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>{provider.name}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        provider.enabled
                          ? "bg-success/15 text-success"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {enabled ? (provider.enabled ? "Active" : "Not configured") : "Checking…"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </>
  );
}
