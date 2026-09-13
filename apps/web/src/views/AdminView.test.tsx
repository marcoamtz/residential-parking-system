import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CycleSummary } from "@/lib/api";
import { renderWithQuery } from "@/test/render";
import { AdminView } from "./AdminView";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  admin: {
    cycles: vi.fn(),
    cycle: vi.fn(),
    createCycle: vi.fn(),
    draw: vi.fn(),
    spots: vi.fn(),
    createSpot: vi.fn(),
    setSpotActive: vi.fn(),
  },
}));

import { admin } from "@/lib/api";

const mocked = vi.mocked(admin);

const openCycle: CycleSummary = {
  id: "c3",
  sequence: 3,
  status: "open",
  startsOn: "2026-10-01",
  endsOn: "2026-12-31",
  registrations: 7,
};
const drawnCycle: CycleSummary = { ...openCycle, id: "c2", sequence: 2, status: "drawn" };

function arrange() {
  mocked.cycles.mockResolvedValue([openCycle, drawnCycle]);
  mocked.spots.mockResolvedValue([{ id: "s1", label: "P1", isActive: true }]);
  mocked.cycle.mockResolvedValue({
    cycle: { id: "c3", sequence: 3, status: "drawn", startsOn: "2026-10-01", endsOn: "2026-12-31" },
    registrations: [],
    draw: null,
  });
  mocked.draw.mockResolvedValue({ allocations: 4, entrants: 7, spots: 4 });
}

describe("AdminView draw confirmation", () => {
  it("offers Run draw only for open cycles", async () => {
    arrange();
    renderWithQuery(<AdminView />);

    const rows = await screen.findAllByRole("row");
    const open = rows.find((r) => within(r).queryByText("open"));
    const drawn = rows.find((r) => within(r).queryByText("drawn"));
    if (!open || !drawn) throw new Error("rows not rendered");
    expect(within(open).getByRole("button", { name: "Run draw" })).toBeInTheDocument();
    expect(within(drawn).queryByRole("button", { name: "Run draw" })).toBeNull();
  });

  it("does not call the API until the dialog is confirmed, and not at all on cancel", async () => {
    arrange();
    renderWithQuery(<AdminView />);

    await userEvent.click(await screen.findByRole("button", { name: "Run draw" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("Run the draw for cycle 3?");
    expect(within(dialog).getByText(/7 registered residents/)).toBeInTheDocument();
    expect(mocked.draw).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocked.draw).not.toHaveBeenCalled();
  });

  it("runs the draw for the confirmed cycle and shows its results", async () => {
    arrange();
    renderWithQuery(<AdminView />);

    await userEvent.click(await screen.findByRole("button", { name: "Run draw" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Run draw" }));

    // TanStack Query passes (variables, context) to mutationFn; only the variables matter here.
    await waitFor(() => expect(mocked.draw.mock.calls[0]?.[0]).toBe("c3"));
    expect(await screen.findByText(/Cycle 3: /)).toBeInTheDocument();
    expect(mocked.cycle).toHaveBeenCalledWith("c3");
  });

  it("closes the dialog with Escape without drawing", async () => {
    arrange();
    renderWithQuery(<AdminView />);

    await userEvent.click(await screen.findByRole("button", { name: "Run draw" }));
    await screen.findByRole("alertdialog");
    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocked.draw).not.toHaveBeenCalled();
  });
});
