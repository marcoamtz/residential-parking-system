# ADR-0011: shadcn/ui on Radix primitives from the start

Status: Accepted, 2026-09-08. Amends the styling sentence of [ADR-0010](0010-react-vite-spa.md).

## Context

The web client started with about eighty lines of hand-written components styled with Tailwind: button, card, badge, table, inputs. That was enough for three views, and the brief says working code is not the emphasis.

Two things argued against leaving it there. First, the design system is a foundation decision: every view a team writes builds on it, so deferring it means either migrating every view later or living with two component vocabularies. Migrations of that kind are where regressions hide. Second, the client already had a destructive action, running the draw, guarded by an inline two-step button because no accessible dialog primitive was available. That was a workaround, not a design.

## Decision

Adopt shadcn/ui now, on Radix primitives (`radix-nova` preset, neutral base, CSS variables), initialized in `apps/web` with the `@/` import alias. Components live in `apps/web/src/components/ui` as owned source; app-specific helpers that are not primitives (`ErrorText`, `Muted`, `StatusBadge`) live in `apps/web/src/components/feedback.tsx`.

The draw confirmation is a Radix `AlertDialog`: focus trap, Escape to cancel, labelled title and description, background marked inert for assistive technology.

## Consequences

- One component vocabulary from the first view onward. New screens compose `Button`, `Card`, `Table`, `Input`, `Label`, `Badge`, `AlertDialog` and add further primitives with the CLI as needed.
- Accessibility of composite widgets comes from Radix rather than from hand-rolled focus management. The draw dialog was verified in a headless browser: `role="alertdialog"`, page content `aria-hidden` while open, initial focus on Cancel.
- Card titles are wrapped in `h2` inside `CardTitle` so the heading hierarchy stays intact for screen-reader navigation; shadcn renders `CardTitle` as a `div` by default.
- Added dependencies: `radix-ui`, `class-variance-authority`, `cn`, `lucide-react`, `tw-animate-css`, `shadcn`, and the Geist font package. All are development-time or small runtime additions; the production bundle remains a static SPA.
- Component source is owned. Upstream changes are adopted deliberately with the CLI's diff, never pulled in automatically.

## Alternatives considered

- Keep owned Tailwind components and adopt shadcn/ui when a composite widget appears: the position held for a day. Rejected because it defers a foundation decision and because a composite widget (the confirmation dialog) already existed in disguise.
- A full component library (Mantine, MUI): styling lock-in and runtime CSS-in-JS for a two-page portal, with less control over markup.
- Headless UI or React Aria directly, without shadcn: equally accessible, but every component would be styled from scratch, which is the work shadcn removes.
