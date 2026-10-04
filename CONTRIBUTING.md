# How we work

## Weekly rhythm

| Day | What |
|-----|------|
| Mon | 15-min call: pick this week's items, say them out loud |
| Tue–Wed | Solo deep work on your branch |
| Thu | 90-min pair session: each explains one concept, then build together |
| Fri–Sat | Solo build time on the phase project |
| Sun | Open your PR, review the other's PR, post in the Weekly log |

## Branches and PRs

- Never commit to `main` directly. Branch per piece of work:
  `<username>/<phase>-<topic>`, e.g. `ghassen/p03-micrograd`.
- Commit messages: `<type>: <description>` with types `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.
- Every PR needs one approval from the other person before merging.
- Reviewing is learning: ask "why" questions, not only style nits.

## Rules

1. **Learn → build → explain.** If you can't explain it to the other in 5 minutes, revisit it.
2. **Type the code yourself in phases 1–3.** AI assistants are for questions, not answers.
3. **No secrets in Git.** Keys go in `.env` (gitignored). Set a monthly spend limit in every provider console.
4. **No large files in Git.** Datasets and model weights go in `data/` or `models/` (gitignored) or on Hugging Face.
5. **Clear notebook outputs** before committing unless the output is the point (charts in a write-up).
6. **Behind schedule?** Cut optional items, never the phase's Ship project.
