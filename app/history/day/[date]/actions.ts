"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const loggingIntents = new Set(["attempted", "not_attempted", "excused"]);

export async function saveLoggingIntent(formData: FormData) {
  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  const ownerId = identity?.claims.sub;
  if (!ownerId) redirect("/login");

  const date = String(formData.get("date") ?? "");
  const rawIntent = String(formData.get("logging_intent") ?? "");
  const loggingIntent = rawIntent || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (loggingIntent && !loggingIntents.has(loggingIntent))) {
    redirect(`/history/day/${date}?error=Could%20not%20save%20logging%20intent`);
  }

  const { data: existing } = await supabase
    .from("daily_logs")
    .select("date")
    .eq("owner_id", ownerId)
    .eq("date", date)
    .maybeSingle();
  const { error } = existing
    ? await supabase.from("daily_logs").update({ logging_intent: loggingIntent }).eq("owner_id", ownerId).eq("date", date)
    : loggingIntent
      ? await supabase.from("daily_logs").insert({ owner_id: ownerId, date, logging_intent: loggingIntent })
      : { error: null };
  redirect(error ? `/history/day/${date}?error=Could%20not%20save%20logging%20intent` : `/history/day/${date}?saved=1`);
}
