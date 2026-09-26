"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const number = (value: FormDataEntryValue | null) => {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export async function saveMeasurements(formData: FormData) {
  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  const ownerId = identity?.claims.sub;
  if (!ownerId) redirect("/login");
  const arm = number(formData.get("arm_cm"));
  const thigh = number(formData.get("thigh_cm"));
  const calf = number(formData.get("calf_cm"));
  const measurementId = String(formData.get("measurement_id") ?? "");
  const measurement = {
    owner_id: ownerId,
    date: String(formData.get("date")),
    chest_cm: number(formData.get("chest_cm")),
    waist_cm: number(formData.get("waist_cm")),
    left_arm_cm: number(formData.get("left_arm_cm")) ?? arm,
    right_arm_cm: number(formData.get("right_arm_cm")) ?? arm,
    left_thigh_cm: number(formData.get("left_thigh_cm")) ?? thigh,
    right_thigh_cm: number(formData.get("right_thigh_cm")) ?? thigh,
    left_calf_cm: number(formData.get("left_calf_cm")) ?? calf,
    right_calf_cm: number(formData.get("right_calf_cm")) ?? calf,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
  const { error } = measurementId
    ? await supabase.from("body_measurements").update(measurement).eq("id", measurementId).eq("owner_id", ownerId)
    : await supabase.from("body_measurements").upsert(measurement, { onConflict: "owner_id,date" });
  if (error) {
    const url = measurementId ? `/body?edit=${measurementId}&error=` : "/body?error=";
    redirect(`${url}${encodeURIComponent("Could not save measurements.")}`);
  }
  redirect("/body?saved=1");
}

export async function deleteMeasurement(formData: FormData) {
  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  const ownerId = identity?.claims.sub;
  if (!ownerId) redirect("/login");

  const measurementId = String(formData.get("measurement_id") ?? "");
  const { error } = await supabase
    .from("body_measurements")
    .delete()
    .eq("id", measurementId)
    .eq("owner_id", ownerId);
  if (error) redirect(`/body?edit=${measurementId}&error=${encodeURIComponent("Could not delete measurement.")}`);
  redirect("/body");
}

export async function saveBodyweight(formData: FormData) {
  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  const ownerId = identity?.claims.sub;
  if (!ownerId) redirect("/login");

  const weight = number(formData.get("weight_kg"));
  const date = String(formData.get("date") ?? "");
  if (!weight || !date) redirect("/body?error=Enter%20a%20valid%20date%20and%20weight.");

  const { error } = await supabase.from("daily_logs").upsert(
    { owner_id: ownerId, date, weight_kg: weight },
    { onConflict: "owner_id,date" },
  );
  if (error) redirect(`/body?error=${encodeURIComponent("Could not save bodyweight.")}`);
  redirect("/body?weightSaved=1");
}
