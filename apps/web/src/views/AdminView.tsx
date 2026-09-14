import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { ErrorText, Muted, StatusBadge } from "@/components/feedback";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { admin, type CycleSummary } from "@/lib/api";
import { formatDateTime, formatPeriod } from "@/lib/format";

export function AdminView() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <CyclesCard selected={selected} onSelect={setSelected} />
        <div className="space-y-4">
          <NewCycleCard />
          <SpotsCard />
        </div>
      </div>
      {selected && <CycleDetailCard cycleId={selected} />}
    </div>
  );
}

function CyclesCard({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const cycles = useQuery({ queryKey: ["admin", "cycles"], queryFn: admin.cycles });
  const draw = useMutation({
    mutationFn: admin.draw,
    onSuccess: (_, id) => {
      onSelect(id);
      queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Cycles</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {cycles.isPending && <Muted>Loading…</Muted>}
        <ErrorText error={cycles.error} />
        {cycles.data && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Entrants</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cycles.data.map((c) => (
                <TableRow key={c.id} data-state={selected === c.id ? "selected" : undefined}>
                  <TableCell>{c.sequence}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatPeriod(c.startsOn, c.endsOn)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={c.status}>{c.status}</StatusBadge>
                  </TableCell>
                  <TableCell>{c.registrations}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => onSelect(c.id)}>
                        View
                      </Button>
                      {c.status === "open" && (
                        <DrawDialog
                          cycle={c}
                          pending={draw.isPending}
                          onConfirm={() => draw.mutate(c.id)}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <ErrorText error={draw.error} />
      </CardContent>
    </Card>
  );
}

/** Destructive, irreversible action: a real dialog with focus trap and Escape, not an inline toggle. */
function DrawDialog({
  cycle,
  pending,
  onConfirm,
}: {
  cycle: CycleSummary;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" disabled={pending}>
          Run draw
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Run the draw for cycle {cycle.sequence}?</AlertDialogTitle>
          <AlertDialogDescription>
            {cycle.registrations} registered residents will be ranked and the active spots assigned.
            Registration closes, the result is final, and residents see it immediately.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Run draw</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function NewCycleCard() {
  const queryClient = useQueryClient();
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const create = useMutation({
    mutationFn: admin.createCycle,
    onSuccess: () => {
      setStartsOn("");
      setEndsOn("");
      queryClient.invalidateQueries({ queryKey: ["admin", "cycles"] });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate({ startsOn, endsOn });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Open a new cycle</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="starts-on">Starts</Label>
              <Input
                id="starts-on"
                type="date"
                required
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="ends-on">Ends</Label>
              <Input
                id="ends-on"
                type="date"
                required
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
              />
            </div>
          </div>
          <Button type="submit" disabled={create.isPending}>
            Create cycle
          </Button>
          <ErrorText error={create.error} />
          <Muted>Only one cycle can be open per building.</Muted>
        </form>
      </CardContent>
    </Card>
  );
}

function SpotsCard() {
  const queryClient = useQueryClient();
  const spots = useQuery({ queryKey: ["admin", "spots"], queryFn: admin.spots });
  const [label, setLabel] = useState("");
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "spots"] });
  const create = useMutation({
    mutationFn: admin.createSpot,
    onSuccess: () => {
      setLabel("");
      invalidate();
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      admin.setSpotActive(id, isActive),
    onSuccess: invalidate,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (label.trim()) create.mutate(label.trim());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Spots</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="mb-3 space-y-1 text-sm">
          {spots.data?.map((s) => (
            <li key={s.id} className="flex items-center justify-between">
              <span className={s.isActive ? "" : "text-muted-foreground line-through"}>
                {s.label}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggle.mutate({ id: s.id, isActive: !s.isActive })}
                disabled={toggle.isPending}
                aria-label={`${s.isActive ? "Deactivate" : "Activate"} spot ${s.label}`}
              >
                {s.isActive ? "Deactivate" : "Activate"}
              </Button>
            </li>
          ))}
        </ul>
        <form onSubmit={submit} className="flex gap-2">
          <Label htmlFor="spot-label" className="sr-only">
            New spot label
          </Label>
          <Input
            id="spot-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="P5"
          />
          <Button type="submit" variant="outline" disabled={create.isPending}>
            Add
          </Button>
        </form>
        <ErrorText error={create.error ?? toggle.error} />
      </CardContent>
    </Card>
  );
}

function CycleDetailCard({ cycleId }: { cycleId: string }) {
  const detail = useQuery({
    queryKey: ["admin", "cycle", cycleId],
    queryFn: () => admin.cycle(cycleId),
  });
  if (detail.isPending) return <Muted>Loading cycle…</Muted>;
  if (detail.isError) return <ErrorText error={detail.error} />;
  const { cycle, registrations, draw } = detail.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>
            Cycle {cycle.sequence}: {formatPeriod(cycle.startsOn, cycle.endsOn)}
          </h2>
        </CardTitle>
        <CardAction>
          <StatusBadge tone={cycle.status}>{cycle.status}</StatusBadge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {registrations.length === 0 ? (
          <Muted>No registrations.</Muted>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Resident</TableHead>
                <TableHead>Spot</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registrations.map((r) => (
                <TableRow key={r.registrationId}>
                  <TableCell>{r.rank ?? "–"}</TableCell>
                  <TableCell>{r.unit}</TableCell>
                  <TableCell className="text-muted-foreground">{r.fullName}</TableCell>
                  <TableCell>
                    {r.spotLabel ? (
                      <StatusBadge tone="open">{r.spotLabel}</StatusBadge>
                    ) : (
                      <StatusBadge tone="muted">none</StatusBadge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {draw && (
          <p className="mt-3 break-all text-xs text-muted-foreground">
            Drawn {formatDateTime(draw.executedAt)}. Seed <code>{draw.seed}</code>.{" "}
            <a
              href={`/api/admin/cycles/${cycle.id}/verification`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Verification record
            </a>{" "}
            holds the exact inputs; replaying it with executeDraw reproduces these allocations.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
