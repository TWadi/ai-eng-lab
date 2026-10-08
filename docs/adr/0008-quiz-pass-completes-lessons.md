# ADR-0008: A lecture completes only by passing its quiz, and stays done

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

Ticking a box gave XP without proof of learning, and boxes could be unticked and re-ticked.

## Decision

For lectures with a quiz, a 4/5 pass (solo or in a duel) marks the lecture done through a trigger, and manual ticks are refused until then. Nobody can delete progress. A duel's answer sheet counts as a quiz.

## Consequences

Progress means something. Mistaken ticks on quiz-less items need an admin fix in the database.
