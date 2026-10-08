# ADR-0004: Public API schema, private internals schema

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

Secret tables (answer keys, question bank, allow-lists) and internal helpers lived in `public`. They were protected only because no RLS policy allowed access, and they were visible to the Supabase API.

## Decision

`public` holds only the declared ports: the tables the site reads and the functions it calls. Everything else moves to `private`, which the API can't see. Every rule's number is defined once as a settings function. `70_api_surface.sql` fixes the API surface as a contract.

## Consequences

Accidental exposure becomes a failing test instead of a leak. Adding an endpoint is an explicit, reviewed change. Functions must reference `private.*` explicitly.
