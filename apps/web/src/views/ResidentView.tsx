import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorText, Muted, StatusBadge } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { resident } from "@/lib/api";
import { formatDate, formatPeriod } from "@/lib/format";

export function ResidentView() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["resident", "status"], queryFn: resident.status });
  const register = useMutation({
    mutationFn: resident.register,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resident", "status"] }),
  });

  if (status.isPending) return <Muted>Loading your status…</Muted>;
  if (status.isError) return <ErrorText error={status.error} />;

  const { resident: me, current, next, upcoming, history } = status.data;

  return (
    <div className="space-y-4">
      <Muted>
        {me.fullName}, unit {me.unit}
      </Muted>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>This quarter</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {current ? (
              <>
                <p className="text-3xl font-semibold">Spot {current.spotLabel}</p>
                <Muted>{formatPeriod(current.startsOn, current.endsOn)}</Muted>
              </>
            ) : (
              <>
                <p className="text-lg font-medium">No spot this quarter</p>
                <Muted>Residents who go without a spot rank first in the next draw.</Muted>
              </>
            )}
          </CardContent>
        </Card>

        {next && (
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Next quarter</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {next.outcome === "allocated" && (
                <>
                  <p className="text-3xl font-semibold">Spot {next.spotLabel}</p>
                  <Muted>
                    From {formatDate(next.startsOn)} to {formatDate(next.endsOn)}
                  </Muted>
                </>
              )}
              {next.outcome === "not_allocated" && (
                <>
                  <p className="text-lg font-medium">No spot next quarter</p>
                  <Muted>
                    Drawn for {formatPeriod(next.startsOn, next.endsOn)}. Every quarter without a
                    spot moves you up in the following draw.
                  </Muted>
                </>
              )}
              {next.outcome === "not_entered" && (
                <>
                  <p className="text-lg font-medium">You did not enter</p>
                  <Muted>The draw for {formatPeriod(next.startsOn, next.endsOn)} has run.</Muted>
                </>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Next draw</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming ? (
              <>
                <p className="text-sm">
                  Cycle {upcoming.cycleSequence}: {formatPeriod(upcoming.startsOn, upcoming.endsOn)}
                </p>
                {upcoming.registered ? (
                  <p className="mt-2">
                    <StatusBadge tone="open">Registered</StatusBadge>
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
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Your history</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <Muted>You have not entered a draw yet.</Muted>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>
                    <span className="sr-only">Verification</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.cycleSequence}>
                    <TableCell>{h.cycleSequence}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatPeriod(h.startsOn, h.endsOn)}
                    </TableCell>
                    <TableCell>
                      {h.outcome === "allocated" ? (
                        <StatusBadge tone="open">Spot {h.spotLabel}</StatusBadge>
                      ) : (
                        <StatusBadge tone="muted">No spot</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <a
                        href={`/api/resident/draws/${h.cycleId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        Verification record
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            How the draw ranks entrants: longest wait since a spot first, then fewest spots ever,
            then most attempts, then a seeded coin flip. Each drawn cycle has a verification record
            with the seed and the exact ranking inputs; anyone can replay it and get the same
            result.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
