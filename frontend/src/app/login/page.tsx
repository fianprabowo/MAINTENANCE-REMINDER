import { redirect } from "next/navigation";
import { isFeatureEnabled } from "@/lib/supabase";
import LoginPageContent from "./LoginPageContent";

/**
 * Server-side feature gate untuk `/login`.
 * Flag dibaca dari `public.system_parameter` (key `login_page`).
 * - Default fail-safe: kalau flag bukan boolean true → redirect ke `/access`.
 * - Karena ini Server Component dengan `force-dynamic`, gating tidak bisa di-bypass dari sisi browser
 *   (URL tidak bisa "diakali" karena keputusan diambil sebelum HTML dikirim).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LoginPage() {
  const enabled = await isFeatureEnabled("login_page");
  if (!enabled) redirect("/access");
  return <LoginPageContent />;
}
