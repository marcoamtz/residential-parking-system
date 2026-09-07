# ADR-0006: Hono API with shared request/response types

Status: Accepted, 2026-09-06

## Context

The API is small: authentication, resident status and registration, and administrative cycle operations. It must also accept webhooks from external systems later (camera events), so it has to remain plain HTTP. The web client and the API live in the same repository, so a shared contract should not require code generation.

## Decision

Hono on Node.js LTS. Routes validate input with Zod. The API exports its route type, and the web client uses Hono's typed client so that request parameters and response shapes are checked at compile time across the workspace boundary.

Endpoints stay conventional HTTP with JSON bodies. The typed client is a convenience for the first-party web app, not a protocol.

## Consequences

- A change to a response shape fails the web build immediately. No drift between client and server.
- External systems integrate with ordinary HTTP endpoints; nothing about the typed client leaks into the contract.
- Hono is built on the web standard `Request` and `Response`, so the same code runs on Node.js, Bun, or edge runtimes. Node.js LTS is the production target because observability and container tooling are mature there.
- Cost: Hono has a smaller ecosystem than Express or NestJS. Accepted because the API surface is small and the built-in middleware (JWT, CORS, logging) covers it.

## Alternatives considered

- Express: mature, but untyped by default and callback-oriented. Type sharing would need OpenAPI generation.
- NestJS: strong structure for large teams, but its module and decorator system is more ceremony than a four-resource API needs.
- tRPC: excellent type safety, but couples clients to its own protocol, which is wrong for webhook consumers.
