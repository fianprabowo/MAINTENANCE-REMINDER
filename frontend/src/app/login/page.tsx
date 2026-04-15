"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mb-1 text-xs font-medium text-red-400">{message}</p>;
}

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const { login } = useAuth();
  const router = useRouter();

  const isEmail = identifier.includes("@");

  const validateField = (field: string, value?: string) => {
    if (field === "identifier") {
      const v = value ?? identifier;
      if (!v.trim()) return "Email or phone number is required";
    }
    if (field === "password") {
      const v = value ?? password;
      if (!v) return "Password is required";
    }
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors((prev) => ({ ...prev, [field]: validateField(field) }));
  };

  const validateAll = (): boolean => {
    const all: Record<string, string | undefined> = {
      identifier: validateField("identifier"),
      password: validateField("password"),
    };
    setErrors(all);
    setTouched({ identifier: true, password: true });
    return !Object.values(all).some(Boolean);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAll()) return;

    setLoading(true);
    try {
      await login(
        isEmail ? identifier : null,
        !isEmail ? identifier : null,
        password
      );
      toast.success("Welcome back!");
      router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-2xl border px-4 py-3.5 text-sm outline-none transition-colors placeholder:text-(--color-text-muted) focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary)/20";

  const borderFor = (field: string) =>
    errors[field] && touched[field] ? "border-red-300 dark:border-red-800/60" : "border-(--color-border)";

  return (
    <div className="flex min-h-screen flex-col justify-between px-6 py-12">
      <div />

      <div>
        <div className="mb-10 text-center">
          <div className="mb-4 text-5xl">🚗</div>
          <h1 className="text-2xl font-bold uppercase tracking-wide">
            Welcome Back
          </h1>
          <p className="mt-2 text-sm text-(--color-text-secondary)">
            Sign in to your maintenance tracker
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <FieldError message={touched.identifier ? errors.identifier : undefined} />
            <input
              type="text"
              value={identifier}
              onChange={(e) => { setIdentifier(e.target.value); if (touched.identifier) setErrors((p) => ({ ...p, identifier: validateField("identifier", e.target.value) })); }}
              onBlur={() => handleBlur("identifier")}
              className={`${inputClass} ${borderFor("identifier")}`}
              placeholder="Email or phone number *"
            />
          </div>

          <div>
            <FieldError message={touched.password ? errors.password : undefined} />
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (touched.password) setErrors((p) => ({ ...p, password: validateField("password", e.target.value) })); }}
              onBlur={() => handleBlur("password")}
              className={`${inputClass} ${borderFor("password")}`}
              placeholder="Password *"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-(--color-primary) px-4 py-4 text-base font-bold text-white shadow-lg shadow-(--color-primary)/30 transition-all hover:brightness-110 active:scale-[0.98] active:brightness-90 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-(--color-text-muted)">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-semibold text-(--color-primary)">
          Sign up
        </Link>
      </p>
    </div>
  );
}
