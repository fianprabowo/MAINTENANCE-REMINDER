import { redirect } from "next/navigation";
import { isFeatureEnabled } from "@/lib/supabase";
import RegisterPageContent from "./RegisterPageContent";

/**
 * Server-side feature gate untuk `/register`.
 * Flag dibaca dari `public.system_parameter` (key `signup_page`).
 * - Default fail-safe: kalau flag bukan boolean true → redirect ke `/access`.
 * - Karena ini Server Component dengan `force-dynamic`, gating tidak bisa di-bypass dari sisi browser
 *   (URL tidak bisa "diakali" karena keputusan diambil sebelum HTML dikirim).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RegisterPage() {
  const enabled = await isFeatureEnabled("signup_page");
  if (!enabled) redirect("/access");
  return <RegisterPageContent />;
}
