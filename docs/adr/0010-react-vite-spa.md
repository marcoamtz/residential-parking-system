# ADR-0010: React single-page app built with Vite

Status: Accepted, 2026-09-06

## Context

The user interface is an authenticated portal: a resident sees their own status, an administrator manages a building. There is no public content, so search indexing and first-paint of anonymous pages do not matter. The brief allows React, Angular, or plain JavaScript.

## Decision

React with TypeScript, built by Vite, as a single-page application served as static files. Server state is handled with TanStack Query so that fetching, caching, and refetching after mutations need no hand-written state management. Styling uses Tailwind CSS with a small set of owned components rather than a component framework dependency.

## Consequences

- No server-side rendering layer to operate. The API is the only server.
- The API contract types flow into the client (ADR-0006), so most integration mistakes surface at compile time.
- Angular would have been an equally valid choice. React was selected because it is the team's stronger skill and because the framework-agnostic API means a future rewrite of the client, in either direction, does not touch business logic.
- Cost: a single-page app needs a routing and loading strategy for the first request. Acceptable for a two-page portal.

## Alternatives considered

- Next.js or another server-rendered framework: adds a server tier for a portal that has no anonymous pages.
- Angular: viable, with stronger built-in structure. Not chosen for team-skill reasons, not technical ones.
- Plain JavaScript: acceptable per the brief, but gives up the type sharing that catches contract drift.
