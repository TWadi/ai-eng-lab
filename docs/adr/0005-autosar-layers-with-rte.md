# ADR-0005: AUTOSAR-style frontend layers with an RTE

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

The frontend grew to about 6,000 lines with components calling Supabase and workers directly. Domain logic imported React hooks, and nothing stopped new shortcuts.

## Decision

Layers are `app` (composition root), `swc/ui`, `swc/logic` (pure), `rte` (typed ports + hooks) and `bsw` (Supabase adapters, workers). Components reach infrastructure only through RTE ports. Sender/Receiver ports are `load`/`watch`; Client/Server ports return `Outcome<T>`. dependency-cruiser enforces the directions in CI.

## Consequences

Infrastructure is swappable (an offline implementation exists, and tests use fake ports). Layer violations fail the build. Slightly more code per feature: a port, an adapter and a hook.
