# ADR-0009: Players join by GitHub identity, approved by admins, without repo access

- **Status:** Accepted
- **Date:** 2026-10-06

## Context

Friends outside the founders want to play, but must not become GitHub repo collaborators. An email sign-up could also claim someone's username.

## Decision

Anyone can sign in with GitHub. Admins (TWadi, Ghassen) let people in or decline them on the site. Membership and admin rights are granted only to accounts whose provider, recorded server-side by Supabase Auth, is GitHub. Site membership is independent from repo access.

## Consequences

Open to friends, closed to impersonation, and nobody gains repo rights. Admin lists live in `private` and change via migrations or admin functions.
