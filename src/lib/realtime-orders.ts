import { createClient } from "@/lib/supabase/client";

const DEBOUNCE_MS = 250;
const FALLBACK_POLL_MS = 15_000;

export function subscribeOrgOrderChanges(
  orgId: string,
  onChange: () => void,
): () => void {
  const supabase = createClient();
  let debounceTimer: number | null = null;

  const schedule = () => {
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      onChange();
    }, DEBOUNCE_MS);
  };

  const channel = supabase
    .channel(`org-orders:${orgId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "sale_orders",
        filter: `organization_id=eq.${orgId}`,
      },
      schedule,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "sale_order_lines",
      },
      schedule,
    );

  try {
    channel.subscribe();
  } catch {
    // Realtime may be disabled until migration is applied.
  }

  const poll = window.setInterval(onChange, FALLBACK_POLL_MS);
  onChange();

  return () => {
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    window.clearInterval(poll);
    void supabase.removeChannel(channel);
  };
}
