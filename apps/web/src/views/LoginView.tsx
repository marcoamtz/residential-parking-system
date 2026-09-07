import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Button, Card, ErrorText, Muted } from "../components/ui";
import { auth } from "../lib/api";

export function LoginView() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const devUsers = useQuery({ queryKey: ["dev-users"], queryFn: auth.devUsers, retry: false });
  const login = useMutation({
    mutationFn: auth.login,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (email.trim()) login.mutate(email.trim());
  }

  const admins = devUsers.data?.filter((u) => u.role === "admin") ?? [];
  const residents = devUsers.data?.filter((u) => u.role === "resident") ?? [];

  return (
    <div className="mx-auto mt-16 max-w-md space-y-4">
      <Card title="Sign in">
        <form onSubmit={submit} className="flex gap-2">
          <label htmlFor="email" className="sr-only">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@parking.local"
            className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
          />
          <Button type="submit" disabled={login.isPending}>
            Sign in
          </Button>
        </form>
        <ErrorText error={login.error} />
        <Muted>
          Development build: no password. Production replaces this with the identity provider.
        </Muted>
      </Card>

      {devUsers.data && (
        <Card title="Seeded accounts">
          <div className="space-y-3">
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Administrator
              </h3>
              <div className="flex flex-wrap gap-2">
                {admins.map((u) => (
                  <Button key={u.email} variant="secondary" onClick={() => login.mutate(u.email)}>
                    {u.email}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Residents
              </h3>
              <div className="flex flex-wrap gap-2">
                {residents.map((u) => (
                  <Button key={u.email} variant="secondary" onClick={() => login.mutate(u.email)}>
                    Unit {u.unit}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
