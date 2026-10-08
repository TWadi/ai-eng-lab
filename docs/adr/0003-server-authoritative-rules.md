# ADR-0003: Game rules run in the database

- **Status:** Accepted
- **Date:** 2026-10-04

## Context

XP, quiz scores and duel results are competitive. Anything decided in the browser can be faked by calling the API directly.

## Decision

Grading, quiz selection, the duel clock and winner, the progress gate, membership and admin rights are all implemented in Postgres: security-definer functions, triggers and RLS. The browser only displays results.

## Consequences

Cheating needs database access, not just devtools. Logic is in SQL and needs SQL tests (ADR-0004, `supabase/tests`). Accepted exception: coding challenges are graded in the browser (Pyodide), so a solve is trusted.
