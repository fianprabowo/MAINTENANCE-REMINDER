/**
 * Design system barrel — pill-shape / login-page tone primitives.
 *
 * Convention: import via `@/components/ui` supaya semua primitive kelihatan
 * dari satu titik. Tidak perlu deep-import dari `./Button`, `./TextInput`, dsb.
 *
 * Design tokens ada di `src/app/globals.css` (CSS custom properties).
 */
export { default as Button } from "./Button";
export type { ButtonProps } from "./Button";

export { default as IconButton } from "./IconButton";
export type { IconButtonProps } from "./IconButton";

export { default as Modal } from "./Modal";
export type { ModalProps } from "./Modal";

export { default as SectionLabel } from "./SectionLabel";
export type { SectionLabelProps } from "./SectionLabel";

export { default as Spinner } from "./Spinner";

export { default as TextInput } from "./TextInput";
export type { TextInputProps } from "./TextInput";
