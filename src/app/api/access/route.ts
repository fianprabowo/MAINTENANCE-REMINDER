import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const raw = typeof body.code === "string" ? body.code : "";
  const code = raw.trim();
  if (!code) {
    return NextResponse.json({ error: "Access code is required" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !anon) {
    return NextResponse.json(
      { error: "Supabase URL or anon key is not configured." },
      { status: 503 },
    );
  }
  if (!serviceRole) {
    return NextResponse.json(
      {
        error:
          "Server is not configured for access codes. Set SUPABASE_SERVICE_ROLE_KEY (server-only).",
      },
      { status: 503 },
    );
  }

  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row, error: rowErr } = await admin
    .from("user_access_codes")
    .select("user_id, access_code")
    .eq("access_code", code)
    .maybeSingle();

  if (rowErr) {
    return NextResponse.json({ error: "Could not verify access code." }, { status: 500 });
  }
  if (!row?.user_id || !row.access_code) {
    return NextResponse.json({ error: "Invalid access code" }, { status: 401 });
  }

  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(row.user_id);
  if (userErr || !userData.user?.email) {
    return NextResponse.json({ error: "Could not resolve user for this access code." }, { status: 500 });
  }

  const email = userData.user.email;

  /**
   * Akses lewat access code memang sengaja melompati alur verifikasi email standar.
   * Maka di sini selalu paksa email_confirm: true agar signInWithPassword di bawah
   * tidak ditolak dengan "Email not confirmed" untuk user yang dibuat via Dashboard
   * tanpa centang "Auto Confirm User".
   */
  const { error: syncErr } = await admin.auth.admin.updateUserById(row.user_id, {
    password: row.access_code,
    email_confirm: true,
  });
  if (syncErr) {
    return NextResponse.json(
      {
        error:
          "Could not apply access code to this account. Try again or check Supabase Auth settings.",
        details: syncErr.message,
      },
      { status: 500 },
    );
  }

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: row.access_code,
  });

  if (error || !data.session) {
    return NextResponse.json(
      {
        error: "Could not start session after access code.",
        details: error?.message ?? "No session returned by Supabase.",
      },
      { status: 401 },
    );
  }

  return NextResponse.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
}
