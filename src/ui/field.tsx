import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

const control =
  "w-full rounded-[7px] border border-line bg-surface px-2.5 text-[13px] text-ink shadow-[0_1px_0_hsl(var(--shadow)/0.03)] transition-colors placeholder:text-ink-3 hover:border-line-strong focus:border-accent/60 focus:outline-none focus:ring-[3px] focus:ring-accent/15 disabled:opacity-60";

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(control, "h-8", className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(control, "min-h-[72px] resize-y py-2 leading-5", className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        control,
        "h-8 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%221.5%22 viewBox=%220 0 12 12%22><path d=%22m3 4.5 3 3 3-3%22/></svg>')] bg-[right_8px_center] bg-no-repeat pr-7",
        className,
      )}
      {...p}
    >
      {children}
    </select>
  );
});
