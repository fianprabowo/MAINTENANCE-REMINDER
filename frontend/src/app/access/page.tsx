import { redirect } from "next/navigation";
import { isFeatureEnabled } from "@/lib/supabase";
import AccessPageContent from "./AccessPageContent";

/**
 * Saat flag `login_page` = true di `public.system_parameter`, landing diarahkan ke `/login`.
 * Saat flag false / hilang / error → tetap render halaman access-code (perilaku lama).
 *
 * Server Component dengan `force-dynamic` memastikan gating dievaluasi setiap request,
 * sehingga toggle flag dari Dashboard Supabase langsung berlaku tanpa rebuild.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AccessPage() {
  const loginEnabled = await isFeatureEnabled("login_page");
  if (loginEnabled) redirect("/login");
  return <AccessPageContent />;
}
