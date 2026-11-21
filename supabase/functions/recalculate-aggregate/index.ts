// Supabase Edge Function: recalculate-aggregate
// Deploy with: supabase functions deploy recalculate-aggregate
// Optional scheduled or webhook-triggered recalculation to expire stale (>2 hour) aggregates.
// Uses SUPABASE_SERVICE_ROLE_KEY strictly server-side inside Deno runtime.

// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase service configuration" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json().catch(() => ({}));
    const officeId: string | undefined = body.office_id;

    if (officeId) {
      const { error } = await supabase.rpc("recalculate_office_aggregate", {
        p_office_id: officeId,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, office_id: officeId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Batch expire stale aggregates whose last_report_at is older than 2 hours
    const { data: staleRows, error: fetchError } = await supabase
      .from("office_aggregates")
      .select("office_id")
      .gt("recent_report_count", 0)
      .lt("calculated_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
      .limit(200);

    if (fetchError) throw fetchError;

    for (const row of staleRows ?? []) {
      await supabase.rpc("recalculate_office_aggregate", {
        p_office_id: row.office_id,
      });
    }

    return new Response(
      JSON.stringify({ ok: true, recalculated: (staleRows ?? []).length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
