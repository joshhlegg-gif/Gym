"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const progressPhotoBucket = "progress-photos";
const photoViews = new Set(["front", "side", "back", "other"]);
const maxPhotoSize = 10 * 1024 * 1024;

const number = (value: FormDataEntryValue | null) => {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export async function saveMeasurements(formData: FormData) {
  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  const ownerId = identity?.claims.sub;
  if (!ownerId) redirect("/login");
  const measurementId = String(formData.get("measurement_id") ?? "");
  const measurement = {
    owner_id: ownerId,
    date: String(formData.get("date")),
    chest_cm: number(formData.get("chest_cm")),
    waist_cm: number(formData.get("waist_cm")),
    left_arm_cm: number(formData.get("left_arm_cm")),
    right_arm_cm: number(formData.get("right_arm_cm")),
    left_thigh_cm: number(formData.get("left_thigh_cm")),
    right_thigh_cm: number(formData.get("right_thigh_cm")),
    left_calf_cm: number(formData.get("left_calf_cm")),
    right_calf_cm: number(formData.get("right_calf_cm")),
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

export async function uploadProgressPhoto(formData: FormData) {
  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  const ownerId = identity?.claims.sub;
  if (!ownerId) redirect("/login");

  const file = formData.get("photo");
  const date = String(formData.get("date") ?? "");
  const view = String(formData.get("view") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!(file instanceof File) || !file.size || !file.type.startsWith("image/") || file.size > maxPhotoSize || !/^\d{4}-\d{2}-\d{2}$/.test(date) || (view && !photoViews.has(view))) {
    redirect("/body?error=Choose%20an%20image%20up%20to%2010MB%20and%20a%20valid%20date.");
  }

  const extension = file.type === "image/jpeg" ? ".jpg" : file.type === "image/png" ? ".png" : file.type === "image/webp" ? ".webp" : file.type === "image/gif" ? ".gif" : "";
  const storagePath = `${ownerId}/${crypto.randomUUID()}${extension}`;
  const { error: uploadError } = await supabase.storage.from(progressPhotoBucket).upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) redirect(`/body?error=${encodeURIComponent("Could not upload progress photo.")}`);

  const { error: metadataError } = await supabase.from("progress_photos").insert({ owner_id: ownerId, date, storage_path: storagePath, view, notes });
  if (metadataError) {
    await supabase.storage.from(progressPhotoBucket).remove([storagePath]);
    redirect(`/body?error=${encodeURIComponent("Could not save progress photo.")}`);
  }
  redirect("/body?photoSaved=1");
}

export async function deleteProgressPhoto(formData: FormData) {
  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  const ownerId = identity?.claims.sub;
  if (!ownerId) redirect("/login");

  const id = String(formData.get("photo_id") ?? "");
  const { data: photo } = await supabase.from("progress_photos").select("storage_path").eq("id", id).eq("owner_id", ownerId).maybeSingle();
  if (!photo) redirect("/body?error=Could%20not%20delete%20progress%20photo.");
  const { error: storageError } = await supabase.storage.from(progressPhotoBucket).remove([photo.storage_path]);
  if (storageError) redirect(`/body?error=${encodeURIComponent("Could not delete progress photo.")}`);
  const { error: metadataError } = await supabase.from("progress_photos").delete().eq("id", id).eq("owner_id", ownerId);
  redirect(metadataError ? `/body?error=${encodeURIComponent("Could not delete progress photo.")}` : "/body?photoDeleted=1");
}
