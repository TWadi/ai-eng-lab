# ADR-0002: Static site on GitHub Pages, backend on Supabase

- **Status:** Accepted
- **Date:** 2026-10-04

## Context

Two (later three) friends need accounts, shared progress and live updates, and nothing may cost money.

## Decision

Build a React + TypeScript single-page app hosted on GitHub Pages. Use Supabase's free tier for Postgres, GitHub sign-in, realtime and RPC. There are no servers of our own.

## Consequences

No hosting cost and no server to maintain. All business rules must live in the database (see ADR-0003). The anon key ships in the site by design, so security rests on row-level security and grants.
