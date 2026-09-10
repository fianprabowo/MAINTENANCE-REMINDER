"use client";

/**
 * UI register asli — tidak dipakai di runtime (route `/register` redirect ke `/access`).
 * Disimpan agar bisa dipakai lagi nanti.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mb-1 text-xs font-medium text-red-400">{message}</p>;
}

export default function RegisterPageContent() {
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
  const { t } = useTranslation();

  // Validasi diletakkan di dalam komponen agar bisa memakai `t` — biaya
  // sebenarnya rendah karena setiap validator hanya dieksekusi saat blur/submit.
  const validateName = (v: string): string | undefined => {
    if (!v.trim()) return t("register.errorName");
  };
  const validateEmail = (v: string): string | undefined => {
    if (!v.trim()) return t("register.errorEmailRequired");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return t("register.errorEmailInvalid");
  };
  const validatePhone = (v: string): string | undefined => {
    if (!v) return undefined;
    if (!/^\d+$/.test(v)) return t("register.errorPhoneDigits");
    if (v.length < 9 || v.length > 13) return t("register.errorPhoneLength");
  };
  const validatePassword = (v: string): string | undefined => {
    if (!v) return t("register.errorPassword");
    if (v.length < 6) return t("register.errorPasswordShort");
  };
  const validateConfirm = (pw: string, cf: string): string | undefined => {
    if (!cf) return t("register.errorConfirm");
    if (pw !== cf) return t("register.errorMismatch");
  };

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
      const result = await register(
        name.trim(),
        email.trim() || null,
        phone ? `+62${phone}` : null,
        password
      );
      if (result.needsEmailConfirmation) {
        toast.success(t("register.needsEmailConfirm"), { duration: 8000 });
        router.push("/login");
      } else {
        toast.success(t("register.successSimple"));
        router.push("/dashboard");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("register.failed"));
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
            {t("register.title")}
          </h1>
          <p className="mt-2 text-sm text-(--color-text-secondary)">
            {t("register.subtitle")}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          <div>
            <FieldError message={touched.name ? errors.name : undefined} />
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); if (touched.name) setErrors((p) => ({ ...p, name: validateName(e.target.value) })); }}
              onBlur={() => handleBlur("name")}
              className={`${inputClass} ${borderFor("name")}`}
              placeholder={t("register.namePlaceholderShort")}
            />
          </div>

          <div>
            <FieldError message={touched.email ? errors.email : undefined} />
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (touched.email) setErrors((p) => ({ ...p, email: validateEmail(e.target.value) })); }}
              onBlur={() => handleBlur("email")}
              className={`${inputClass} ${borderFor("email")}`}
              placeholder={t("register.emailPlaceholderShort")}
            />
          </div>

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
                placeholder={t("register.phonePlaceholderShort")}
                maxLength={13}
                inputMode="numeric"
              />
            </div>
          </div>

          <div>
            <FieldError message={touched.password ? errors.password : undefined} />
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (touched.password) setErrors((p) => ({ ...p, password: validatePassword(e.target.value) })); }}
              onBlur={() => handleBlur("password")}
              className={`${inputClass} ${borderFor("password")}`}
              placeholder={t("register.passwordPlaceholderShort")}
            />
          </div>

          <div>
            <FieldError message={touched.confirmPassword ? errors.confirmPassword : undefined} />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); if (touched.confirmPassword) setErrors((p) => ({ ...p, confirmPassword: validateConfirm(password, e.target.value) })); }}
              onBlur={() => handleBlur("confirmPassword")}
              className={`${inputClass} ${borderFor("confirmPassword")}`}
              placeholder={t("register.confirmPasswordPlaceholderShort")}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-(--color-primary) px-4 py-4 text-base font-bold text-white shadow-lg shadow-(--color-primary)/30 transition-all hover:brightness-110 active:scale-[0.98] active:brightness-90 disabled:opacity-50"
          >
            {loading ? t("register.submittingLabel") : t("register.submitLabel")}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-(--color-text-muted)">
        {t("register.hasAccount")}{" "}
        <Link href="/login" className="font-semibold text-(--color-primary)">
          {t("register.signIn")}
        </Link>
      </p>
    </div>
  );
}
