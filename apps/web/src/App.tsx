import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorText, Muted } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { ApiError, auth } from "@/lib/api";
import { AdminView } from "@/views/AdminView";
import { LoginView } from "@/views/LoginView";
import { ResidentView } from "@/views/ResidentView";

export function App() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: auth.me, retry: false });
  const logout = useMutation({
    mutationFn: auth.logout,
    onSuccess: async () => {
      // Drop the session first so role views unmount before their queries are removed.
      await queryClient.resetQueries({ queryKey: ["me"] });
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "me" });
    },
  });

  const signedOut = me.isError && me.error instanceof ApiError && me.error.status === 401;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <h1 className="text-lg font-semibold">Residential Parking</h1>
          {me.data && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>
                {me.data.email} · {me.data.role}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
              >
                Sign out
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6">
        {me.isPending && <Muted>Loading…</Muted>}
        {signedOut && <LoginView />}
        {me.isError && !signedOut && <ErrorText error={me.error} />}
        {me.data && (me.data.role === "admin" ? <AdminView /> : <ResidentView />)}
      </main>
    </div>
  );
}
