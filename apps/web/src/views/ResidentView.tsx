import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, ErrorText, Muted } from "../components/ui";
import { resident } from "../lib/api";
import { formatPeriod } from "../lib/format";

export function ResidentView() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["resident", "status"], queryFn: resident.status });
  const register = useMutation({
    mutationFn: resident.register,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resident", "status"] }),
  });

  if (status.isPending) return <Muted>Loading your status…</Muted>;
  if (status.isError) return <ErrorText error={status.error} />;

  const { resident: me, current, upcoming, history } = status.data;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        {me.fullName}, unit {me.unit}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="This quarter">
          {current ? (
            <>
              <p className="text-3xl font-semibold text-slate-900">Spot {current.spotLabel}</p>
              <Muted>{formatPeriod(current.startsOn, current.endsOn)}</Muted>
            </>
          ) : (
            <>
              <p className="text-lg font-medium text-slate-700">No spot this quarter</p>
              <Muted>Residents who go without a spot rank first in the next draw.</Muted>
            </>
          )}
        </Card>

        <Card title="Next draw">
          {upcoming ? (
            <>
              <p className="text-sm text-slate-700">
                Cycle {upcoming.cycleSequence}: {formatPeriod(upcoming.startsOn, upcoming.endsOn)}
              </p>
              {upcoming.registered ? (
                <p className="mt-2">
                  <Badge tone="open">Registered</Badge>
                </p>
              ) : (
                <div className="mt-2">
                  <Button onClick={() => register.mutate()} disabled={register.isPending}>
                    Register for this draw
                  </Button>
                  <ErrorText error={register.error} />
                </div>
              )}
            </>
          ) : (
            <Muted>No cycle is accepting registrations right now.</Muted>
          )}
        </Card>
      </div>

      <Card title="Your history">
        {history.length === 0 ? (
          <Muted>You have not entered a draw yet.</Muted>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="py-1 pr-4">
                  Cycle
                </th>
                <th scope="col" className="py-1 pr-4">
                  Period
                </th>
                <th scope="col" className="py-1">
                  Outcome
                </th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.cycleSequence} className="border-t border-slate-100">
                  <td className="py-2 pr-4">{h.cycleSequence}</td>
                  <td className="py-2 pr-4 text-slate-600">{formatPeriod(h.startsOn, h.endsOn)}</td>
                  <td className="py-2">
                    {h.outcome === "allocated" ? (
                      <Badge tone="open">Spot {h.spotLabel}</Badge>
                    ) : (
                      <Badge tone="muted">No spot</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-slate-500">
          How the draw ranks entrants: longest wait since a spot first, then fewest spots ever, then
          most attempts, then a seeded coin flip.
        </p>
      </Card>
    </div>
  );
}
