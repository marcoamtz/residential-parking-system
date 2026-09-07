import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Badge, Button, Card, ErrorText, Muted } from "../components/ui";
import { admin } from "../lib/api";
import { formatDateTime, formatPeriod } from "../lib/format";

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
  const [confirming, setConfirming] = useState<string | null>(null);
  const draw = useMutation({
    mutationFn: admin.draw,
    onSuccess: (_, id) => {
      setConfirming(null);
      onSelect(id);
      queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  });

  return (
    <Card title="Cycles">
      {cycles.isPending && <Muted>Loading…</Muted>}
      <ErrorText error={cycles.error} />
      {cycles.data && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-1 pr-3">
                #
              </th>
              <th scope="col" className="py-1 pr-3">
                Period
              </th>
              <th scope="col" className="py-1 pr-3">
                Status
              </th>
              <th scope="col" className="py-1 pr-3">
                Entrants
              </th>
              <th scope="col" className="py-1">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {cycles.data.map((c) => (
              <tr
                key={c.id}
                className={`border-t border-slate-100 ${selected === c.id ? "bg-slate-50" : ""}`}
              >
                <td className="py-2 pr-3">{c.sequence}</td>
                <td className="py-2 pr-3 text-slate-600">{formatPeriod(c.startsOn, c.endsOn)}</td>
                <td className="py-2 pr-3">
                  <Badge tone={c.status}>{c.status}</Badge>
                </td>
                <td className="py-2 pr-3">{c.registrations}</td>
                <td className="py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => onSelect(c.id)}>
                      View
                    </Button>
                    {c.status === "open" &&
                      (confirming === c.id ? (
                        <>
                          <Button
                            variant="danger"
                            onClick={() => draw.mutate(c.id)}
                            disabled={draw.isPending}
                          >
                            Confirm draw
                          </Button>
                          <Button variant="secondary" onClick={() => setConfirming(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button onClick={() => setConfirming(c.id)}>Run draw</Button>
                      ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ErrorText error={draw.error} />
    </Card>
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

  const input =
    "w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500";

  return (
    <Card title="Open a new cycle">
      <form onSubmit={submit} className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-600">
            Starts
            <input
              type="date"
              required
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
              className={input}
            />
          </label>
          <label className="text-xs text-slate-600">
            Ends
            <input
              type="date"
              required
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
              className={input}
            />
          </label>
        </div>
        <Button type="submit" disabled={create.isPending}>
          Create cycle
        </Button>
        <ErrorText error={create.error} />
        <Muted>Only one cycle can be open per building.</Muted>
      </form>
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
    <Card title="Spots">
      <ul className="mb-3 space-y-1 text-sm">
        {spots.data?.map((s) => (
          <li key={s.id} className="flex items-center justify-between">
            <span className={s.isActive ? "" : "text-slate-400 line-through"}>{s.label}</span>
            <Button
              variant="secondary"
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
        <label htmlFor="spot-label" className="sr-only">
          New spot label
        </label>
        <input
          id="spot-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="P5"
          className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
        />
        <Button type="submit" variant="secondary" disabled={create.isPending}>
          Add
        </Button>
      </form>
      <ErrorText error={create.error ?? toggle.error} />
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
    <Card
      title={`Cycle ${cycle.sequence}: ${formatPeriod(cycle.startsOn, cycle.endsOn)}`}
      action={<Badge tone={cycle.status}>{cycle.status}</Badge>}
    >
      {registrations.length === 0 ? (
        <Muted>No registrations.</Muted>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-1 pr-3">
                Rank
              </th>
              <th scope="col" className="py-1 pr-3">
                Unit
              </th>
              <th scope="col" className="py-1 pr-3">
                Resident
              </th>
              <th scope="col" className="py-1">
                Spot
              </th>
            </tr>
          </thead>
          <tbody>
            {registrations.map((r) => (
              <tr key={r.registrationId} className="border-t border-slate-100">
                <td className="py-1.5 pr-3">{r.rank ?? "–"}</td>
                <td className="py-1.5 pr-3">{r.unit}</td>
                <td className="py-1.5 pr-3 text-slate-600">{r.fullName}</td>
                <td className="py-1.5">
                  {r.spotLabel ? (
                    <Badge tone="open">{r.spotLabel}</Badge>
                  ) : (
                    <Badge tone="muted">none</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {draw && (
        <p className="mt-3 break-all text-xs text-slate-500">
          Drawn {formatDateTime(draw.executedAt)}. Seed <code>{draw.seed}</code>. Anyone with the
          seed and the entrant list can replay this draw.
        </p>
      )}
    </Card>
  );
}
