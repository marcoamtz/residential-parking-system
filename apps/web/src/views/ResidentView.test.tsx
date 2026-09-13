import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ResidentStatus } from "@/lib/api";
import { renderWithQuery } from "@/test/render";
import { ResidentView } from "./ResidentView";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  resident: { status: vi.fn(), register: vi.fn() },
}));

import { resident } from "@/lib/api";

const mocked = vi.mocked(resident);

const upcoming: NonNullable<ResidentStatus["upcoming"]> = {
  cycleId: "c3",
  cycleSequence: 3,
  startsOn: "2026-10-01",
  endsOn: "2026-12-31",
  registered: false,
};

const base: ResidentStatus = {
  resident: { id: "r1", unit: "104", fullName: "Diego Salas" },
  current: { cycleSequence: 2, startsOn: "2026-07-01", endsOn: "2026-09-30", spotLabel: "P3" },
  upcoming,
  history: [
    {
      cycleSequence: 2,
      startsOn: "2026-07-01",
      endsOn: "2026-09-30",
      outcome: "allocated",
      spotLabel: "P3",
    },
    {
      cycleSequence: 1,
      startsOn: "2026-04-01",
      endsOn: "2026-06-30",
      outcome: "not_allocated",
      spotLabel: null,
    },
  ],
};

describe("ResidentView", () => {
  it("shows the current spot, the open cycle, and history", async () => {
    mocked.status.mockResolvedValue(base);
    renderWithQuery(<ResidentView />);

    expect(await screen.findByText("Spot P3", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(/Cycle 3:/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register for this draw" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2 history rows
    expect(screen.getByText("No spot")).toBeInTheDocument();
  });

  it("registers and shows the badge once the status refetch confirms it", async () => {
    mocked.status
      .mockResolvedValueOnce(base)
      .mockResolvedValueOnce({ ...base, upcoming: { ...upcoming, registered: true } });
    mocked.register.mockResolvedValue({ registrationId: "reg1" });
    renderWithQuery(<ResidentView />);

    await userEvent.click(await screen.findByRole("button", { name: "Register for this draw" }));

    expect(mocked.register).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Registered")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register for this draw" })).toBeNull();
  });

  it("explains the no-spot state and offers no registration when no cycle is open", async () => {
    mocked.status.mockResolvedValue({ ...base, current: null, upcoming: null });
    renderWithQuery(<ResidentView />);

    expect(await screen.findByText("No spot this quarter")).toBeInTheDocument();
    expect(screen.getByText("No cycle is accepting registrations right now.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Register/ })).toBeNull();
  });

  it("surfaces a registration failure inline", async () => {
    mocked.status.mockResolvedValue(base);
    mocked.register.mockRejectedValue(new Error("Already registered for this cycle"));
    renderWithQuery(<ResidentView />);

    await userEvent.click(await screen.findByRole("button", { name: "Register for this draw" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Already registered for this cycle"),
    );
  });
});
