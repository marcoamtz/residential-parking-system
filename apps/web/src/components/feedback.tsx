import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

/** Small app-specific helpers layered on the shadcn/ui primitives in ./ui. */

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : "Something went wrong";
  return (
    <p role="alert" className="mt-2 text-sm text-destructive">
      {message}
    </p>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** Domain status badges with one consistent color per meaning. */
export function StatusBadge({
  tone,
  children,
}: {
  tone: "open" | "drawn" | "muted";
  children: ReactNode;
}) {
  if (tone === "open") {
    return (
      <Badge className="border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">
        {children}
      </Badge>
    );
  }
  return <Badge variant={tone === "drawn" ? "secondary" : "outline"}>{children}</Badge>;
}
