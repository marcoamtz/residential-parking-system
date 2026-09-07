import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-400",
  secondary: "border border-slate-300 text-slate-800 hover:bg-slate-100 disabled:text-slate-400",
  danger: "bg-red-700 text-white hover:bg-red-600 disabled:bg-red-300",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Badge({
  tone,
  children,
}: {
  tone: "open" | "drawn" | "muted";
  children: ReactNode;
}) {
  const tones = {
    open: "bg-emerald-100 text-emerald-800",
    drawn: "bg-slate-200 text-slate-700",
    muted: "bg-slate-100 text-slate-500",
  };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : "Something went wrong";
  return (
    <p role="alert" className="mt-2 text-sm text-red-700">
      {message}
    </p>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}
