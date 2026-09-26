"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: String(formData.get("email") ?? "").trim(), password: String(formData.get("password") ?? "") });
  if (error) redirect(`/login?error=${encodeURIComponent("Could not sign in. Check your email and password.")}`);
  if (data.user) await supabase.from("profiles").upsert({ id: data.user.id, email: data.user.email });
  redirect("/");
}
