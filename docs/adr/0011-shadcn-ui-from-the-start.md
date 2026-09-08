# ADR-0011: Owned Tailwind components now, shadcn/ui when a composite widget needs it

Status: Accepted, 2026-09-08

## Context

The web client has three views and six element types: button, card, badge, table, text input, and date input. All of them have accessible native HTML equivalents. The brief states that working code is not the emphasis of this assessment.

shadcn/ui was the obvious candidate during stack selection: it copies component source into the repository, styles with Tailwind, and builds on Radix primitives for accessibility. Its value concentrates in composite widgets such as dialogs, dropdown menus, popovers, comboboxes, and toasts, where keyboard and screen-reader behavior is difficult to get right by hand.

## Decision

Keep a small set of owned components in `apps/web/src/components/ui.tsx`, styled with Tailwind CSS, and do not initialize shadcn/ui yet.

Adopt shadcn/ui with the first feature that needs a Radix primitive. Likely triggers: a toast confirming a registration, a dialog guarding a destructive administrative action such as deleting a cycle, or a combobox for selecting residents. At that point run the shadcn initializer, add the components in use, and replace `ui.tsx`.

## Consequences

- No `components.json`, `cn` helper, CSS-variable theme, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, or per-component Radix packages until they carry their weight.
- The owned components follow the same model shadcn uses (source in the repository, Tailwind classes, no runtime CSS-in-JS), so the later swap is mechanical and there is no lock-in in either direction.
- The draw confirmation stays an inline two-step button rather than a modal. That was a deliberate UX choice, not a workaround for the missing dialog primitive.
- Risk accepted: if the first composite widget arrives in a hurry, its author pays the initialization cost then. That cost is under an hour.

## Alternatives considered

- Initialize shadcn/ui now: correct in a product codebase that will grow; here it adds setup with no evaluative signal and no accessibility gain, because nothing composite exists yet.
- A full component library (Mantine, MUI): styling lock-in and runtime CSS-in-JS for a two-page portal.
- Plain CSS without Tailwind: viable, but Tailwind is already the shared vocabulary with shadcn, which keeps the later adoption path short.
