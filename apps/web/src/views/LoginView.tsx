import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { ErrorText, Muted } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth } from "@/lib/api";

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
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Sign in</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex gap-2">
            <Label htmlFor="email" className="sr-only">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@parking.local"
            />
            <Button type="submit" disabled={login.isPending}>
              Sign in
            </Button>
          </form>
          <ErrorText error={login.error} />
          <div className="mt-3">
            <Muted>
              Development build: no password. Production replaces this with the identity provider.
            </Muted>
          </div>
        </CardContent>
      </Card>

      {devUsers.data && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Seeded accounts</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Administrator
              </h3>
              <div className="flex flex-wrap gap-2">
                {admins.map((u) => (
                  <Button
                    key={u.email}
                    variant="outline"
                    size="sm"
                    onClick={() => login.mutate(u.email)}
                  >
                    {u.email}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Residents
              </h3>
              <div className="flex flex-wrap gap-2">
                {residents.map((u) => (
                  <Button
                    key={u.email}
                    variant="outline"
                    size="sm"
                    onClick={() => login.mutate(u.email)}
                  >
                    Unit {u.unit}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
