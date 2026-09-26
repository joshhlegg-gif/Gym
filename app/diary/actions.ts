"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const eventTypes = new Set(["illness", "injury", "holiday", "travel", "deload", "diet_break", "stress", "other"]);

async function getOwner() {
  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  return { supabase, ownerId: identity?.claims.sub };
}

export async function saveLifeEvent(formData: FormData) {
  const { supabase, ownerId } = await getOwner();
  if (!ownerId) redirect("/login");

  const id = String(formData.get("id") ?? "");
  const type = String(formData.get("type") ?? "other");
  const title = String(formData.get("title") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "") || null;
  if (!title || !startDate || !eventTypes.has(type) || (endDate && endDate < startDate)) {
    redirect(`/diary?error=${encodeURIComponent("Enter a title, valid type, and valid dates.")}${id ? `&edit=${id}` : ""}`);
  }

  const values = {
    phase_id: String(formData.get("phase_id") ?? "") || null,
    type,
    title,
    start_date: startDate,
    end_date: endDate,
    notes: String(formData.get("notes") ?? "").trim() || null,
    affects_training: formData.get("affects_training") === "true",
    excuses_nutrition_logging: formData.get("excuses_nutrition_logging") === "true",
  };
  const { error } = id
    ? await supabase.from("life_events").update(values).eq("id", id).eq("owner_id", ownerId)
    : await supabase.from("life_events").insert({ owner_id: ownerId, ...values });

  if (error) redirect(`/diary?error=${encodeURIComponent("Could not save the event.")}${id ? `&edit=${id}` : ""}`);
  redirect("/diary?saved=1");
}

export async function deleteLifeEvent(formData: FormData) {
  const { supabase, ownerId } = await getOwner();
  if (!ownerId) redirect("/login");

  const id = String(formData.get("id") ?? "");
  const { error } = await supabase.from("life_events").delete().eq("id", id).eq("owner_id", ownerId);
  redirect(error ? `/diary?error=${encodeURIComponent("Could not delete the event.")}` : "/diary?deleted=1");
}
