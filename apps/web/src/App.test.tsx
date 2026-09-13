import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "@/test/render";
import { App } from "./App";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    auth: { me: vi.fn(), devUsers: vi.fn(), login: vi.fn(), logout: vi.fn() },
    resident: { status: vi.fn(), register: vi.fn() },
    admin: {
      cycles: vi.fn(),
      cycle: vi.fn(),
      createCycle: vi.fn(),
      draw: vi.fn(),
      spots: vi.fn(),
      createSpot: vi.fn(),
      setSpotActive: vi.fn(),
    },
  };
});

import { ApiError, admin, auth, resident } from "@/lib/api";

describe("App", () => {
  it("shows the sign-in view when the session is missing", async () => {
    vi.mocked(auth.me).mockRejectedValue(new ApiError(401, "unauthenticated", "Sign in required"));
    vi.mocked(auth.devUsers).mockResolvedValue([]);
    renderWithQuery(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("routes a resident to the resident view", async () => {
    vi.mocked(auth.me).mockResolvedValue({
      id: "u1",
      email: "unit104@parking.local",
      role: "resident",
      buildingId: "b1",
      residentId: "r1",
    });
    vi.mocked(resident.status).mockResolvedValue({
      resident: { id: "r1", unit: "104", fullName: "Diego Salas" },
      current: null,
      upcoming: null,
      history: [],
    });
    renderWithQuery(<App />);

    expect(await screen.findByText("Diego Salas, unit 104")).toBeInTheDocument();
    expect(screen.getByText(/unit104@parking.local · resident/)).toBeInTheDocument();
  });

  it("routes an administrator to the admin view", async () => {
    vi.mocked(auth.me).mockResolvedValue({
      id: "u2",
      email: "admin@parking.local",
      role: "admin",
      buildingId: "b1",
      residentId: null,
    });
    vi.mocked(admin.cycles).mockResolvedValue([]);
    vi.mocked(admin.spots).mockResolvedValue([]);
    renderWithQuery(<App />);

    expect(await screen.findByRole("heading", { name: "Cycles" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Open a new cycle" })).toBeInTheDocument();
  });

  it("shows an unexpected error instead of the sign-in view", async () => {
    vi.mocked(auth.me).mockRejectedValue(new ApiError(500, "internal_error", "Unexpected error"));
    renderWithQuery(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unexpected error");
    expect(screen.queryByRole("heading", { name: "Sign in" })).toBeNull();
  });
});
