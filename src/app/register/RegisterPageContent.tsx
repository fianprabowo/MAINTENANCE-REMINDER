"use client";

/**
 * UI register asli — tidak dipakai di runtime (route `/register` redirect ke `/access`).
 * Disimpan agar bisa dipakai lagi nanti.
 */
import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";
import { Button, IconButton, SectionLabel, TextInput } from "@/components/ui";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mb-1 px-2 text-xs font-bold text-(--color-text)">
      {message}
    </p>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="8" cy="15" r="4" />
      <path d="m10.85 12.15 7.15-7.15" />
      <path d="M18 5l3 3" />
      <path d="M16 7l3 3" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

export default function RegisterPageContent() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

  const fieldError = (field: string) => Boolean(touched[field] && errors[field]);

  return (
    <main className="flex min-h-screen flex-col justify-center bg-(--color-bg) px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center text-center">
          <h1 className="sr-only">{t("login.brandTitle")}</h1>
          <Image
            src="/brand/risma-logo.png"
            alt={t("login.brandTitle")}
            width={1024}
            height={682}
            className="mb-4 h-auto w-48 dark:invert"
            priority
          />
          <SectionLabel className="text-balance">{t("login.brandFullName")}</SectionLabel>
        </div>

        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold uppercase tracking-wide">
            {t("register.title")}
          </h2>
          <p className="mt-2 text-sm text-(--color-text-secondary)">
            {t("register.subtitle")}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <FieldError message={touched.name ? errors.name : undefined} />
            <TextInput
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (touched.name) setErrors((p) => ({ ...p, name: validateName(e.target.value) }));
              }}
              onBlur={() => handleBlur("name")}
              placeholder={t("register.namePlaceholderShort")}
              disabled={loading}
              error={fieldError("name")}
            />
          </div>

          <div>
            <FieldError message={touched.email ? errors.email : undefined} />
            <TextInput
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (touched.email) setErrors((p) => ({ ...p, email: validateEmail(e.target.value) }));
              }}
              onBlur={() => handleBlur("email")}
              placeholder={t("register.emailPlaceholderShort")}
              disabled={loading}
              error={fieldError("email")}
            />
          </div>

          <div>
            <FieldError message={touched.phone ? errors.phone : undefined} />
            <TextInput
              type="tel"
              value={phone}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                setPhone(v);
                if (touched.phone) setErrors((p) => ({ ...p, phone: validatePhone(v) }));
              }}
              onBlur={() => handleBlur("phone")}
              placeholder={t("register.phonePlaceholderShort")}
              maxLength={13}
              inputMode="numeric"
              disabled={loading}
              error={fieldError("phone")}
              leadingIcon={
                <span className="text-sm font-semibold text-(--color-text-secondary)">+62</span>
              }
            />
          </div>

          <div>
            <FieldError message={touched.password ? errors.password : undefined} />
            <TextInput
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (touched.password) {
                  setErrors((p) => ({ ...p, password: validatePassword(e.target.value) }));
                }
              }}
              onBlur={() => handleBlur("password")}
              placeholder={t("register.passwordPlaceholderShort")}
              disabled={loading}
              error={fieldError("password")}
              leadingIcon={<KeyIcon className="h-5 w-5" />}
              trailingSlot={
                <IconButton
                  label={showPassword ? t("login.hideCode") : t("login.showCode")}
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? (
                    <EyeOffIcon className="h-5 w-5" />
                  ) : (
                    <EyeIcon className="h-5 w-5" />
                  )}
                </IconButton>
              }
            />
          </div>

          <div>
            <FieldError message={touched.confirmPassword ? errors.confirmPassword : undefined} />
            <TextInput
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (touched.confirmPassword) {
                  setErrors((p) => ({
                    ...p,
                    confirmPassword: validateConfirm(password, e.target.value),
                  }));
                }
              }}
              onBlur={() => handleBlur("confirmPassword")}
              placeholder={t("register.confirmPasswordPlaceholderShort")}
              disabled={loading}
              error={fieldError("confirmPassword")}
              leadingIcon={<KeyIcon className="h-5 w-5" />}
              trailingSlot={
                <IconButton
                  label={showConfirmPassword ? t("login.hideCode") : t("login.showCode")}
                  tabIndex={-1}
                  onClick={() => setShowConfirmPassword((v) => !v)}
                >
                  {showConfirmPassword ? (
                    <EyeOffIcon className="h-5 w-5" />
                  ) : (
                    <EyeIcon className="h-5 w-5" />
                  )}
                </IconButton>
              }
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
            className="mt-2 font-bold uppercase tracking-[0.15em]"
          >
            {loading ? t("register.submittingLabel") : t("register.submitLabel")}
          </Button>
        </form>

        <p className="mt-10 text-center text-xs text-(--color-text-muted)">
          {t("register.hasAccount")}{" "}
          <Link
            href="/login"
            className="font-semibold text-(--color-text) transition-colors hover:underline"
          >
            {t("register.signIn")}
          </Link>
        </p>
      </div>
    </main>
  );
}
