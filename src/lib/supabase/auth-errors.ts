import type { AuthError } from "@supabase/supabase-js";

/** Maps Supabase Auth error codes to clearer copy for toasts. */
export function formatAuthError(error: AuthError): string {
  switch (error.code) {
    case "over_email_send_rate_limit":
      return "Email rate limit exceeded. Wait a few minutes before signing up or resending, or turn off “Confirm email” in Supabase (Auth → Providers → Email) while testing locally.";
    case "email_address_invalid":
      return "Invalid email address.";
    case "user_already_registered":
    case "signup_disabled":
      return error.message;
    default:
      return error.message;
  }
}
