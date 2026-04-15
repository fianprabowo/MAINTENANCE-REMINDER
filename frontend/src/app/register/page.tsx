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

function validateEmail(email: string): string | undefined {
  if (!email.trim()) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Please enter a valid email address";
}

function validatePhone(phone: string): string | undefined {
  if (!phone) return undefined;
  if (!/^\d+$/.test(phone)) return "Phone number must contain digits only";
  if (phone.length < 9 || phone.length > 13) return "Phone number must be 9–13 digits";
}

function validatePassword(password: string): string | undefined {
  if (!password) return "Password is required";
  if (password.length < 6) return "Password must be at least 6 characters";
}

function validateConfirm(password: string, confirm: string): string | undefined {
  if (!confirm) return "Please confirm your password";
  if (password !== confirm) return "Passwords do not match";
}

function validateName(name: string): string | undefined {
  if (!name.trim()) return "Full name is required";
}

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const { register } = useAuth();
  const router = useRouter();

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    validate({ [field]: true });
  };

  const validate = (onlyTouched?: Record<string, boolean>) => {
    const check = onlyTouched || touched;
    const next: Record<string, string | undefined> = {};
    if (check.name) next.name = validateName(name);
    if (check.email) next.email = validateEmail(email);
    if (check.phone) next.phone = validatePhone(phone);
    if (check.password) next.password = validatePassword(password);
    if (check.confirmPassword) next.confirmPassword = validateConfirm(password, confirmPassword);
    setErrors((prev) => ({ ...prev, ...next }));
    return next;
  };

  const validateAll = (): boolean => {
    const all: Record<string, string | undefined> = {
      name: validateName(name),
      email: validateEmail(email),
      phone: validatePhone(phone),
      password: validatePassword(password),
      confirmPassword: validateConfirm(password, confirmPassword),
    };
    setErrors(all);
    setTouched({ name: true, email: true, phone: true, password: true, confirmPassword: true });
    return !Object.values(all).some(Boolean);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAll()) return;

    setLoading(true);
    try {
      await register(
        name.trim(),
        email.trim() || null,
        phone ? `+62${phone}` : null,
        password
      );
      toast.success("Account created!");
      router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
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
          <div className="mb-4 text-5xl">🏍️</div>
          <h1 className="text-2xl font-bold uppercase tracking-wide">
            Create Account
          </h1>
          <p className="mt-2 text-sm text-(--color-text-secondary)">
            Start tracking your vehicle maintenance
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          {/* Name */}
          <div>
            <FieldError message={touched.name ? errors.name : undefined} />
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); if (touched.name) setErrors((p) => ({ ...p, name: validateName(e.target.value) })); }}
              onBlur={() => handleBlur("name")}
              className={`${inputClass} ${borderFor("name")}`}
              placeholder="Your full name *"
            />
          </div>

          {/* Email */}
          <div>
            <FieldError message={touched.email ? errors.email : undefined} />
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (touched.email) setErrors((p) => ({ ...p, email: validateEmail(e.target.value) })); }}
              onBlur={() => handleBlur("email")}
              className={`${inputClass} ${borderFor("email")}`}
              placeholder="Email address *"
            />
          </div>

          {/* Phone with +62 prefix */}
          <div>
            <FieldError message={touched.phone ? errors.phone : undefined} />
            <div className={`flex items-center overflow-hidden rounded-2xl border ${borderFor("phone")} transition-colors focus-within:border-(--color-primary) focus-within:ring-2 focus-within:ring-(--color-primary)/20`}>
              <span className="shrink-0 bg-(--color-surface-alt) px-3.5 py-3.5 text-sm font-medium text-(--color-text-secondary)">
                +62
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setPhone(v);
                  if (touched.phone) setErrors((p) => ({ ...p, phone: validatePhone(v) }));
                }}
                onBlur={() => handleBlur("phone")}
                className="w-full border-none bg-transparent px-3 py-3.5 text-sm outline-none placeholder:text-(--color-text-muted)"
                placeholder="8123456789 (optional)"
                maxLength={13}
                inputMode="numeric"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <FieldError message={touched.password ? errors.password : undefined} />
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (touched.password) setErrors((p) => ({ ...p, password: validatePassword(e.target.value) })); }}
              onBlur={() => handleBlur("password")}
              className={`${inputClass} ${borderFor("password")}`}
              placeholder="Password (min 6 chars) *"
            />
          </div>

          {/* Confirm Password */}
          <div>
            <FieldError message={touched.confirmPassword ? errors.confirmPassword : undefined} />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); if (touched.confirmPassword) setErrors((p) => ({ ...p, confirmPassword: validateConfirm(password, e.target.value) })); }}
              onBlur={() => handleBlur("confirmPassword")}
              className={`${inputClass} ${borderFor("confirmPassword")}`}
              placeholder="Confirm password *"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-(--color-primary) px-4 py-4 text-base font-bold text-white shadow-lg shadow-(--color-primary)/30 transition-all hover:brightness-110 active:scale-[0.98] active:brightness-90 disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-(--color-text-muted)">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-(--color-primary)">
          Sign in
        </Link>
      </p>
    </div>
  );
}
