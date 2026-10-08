# Security policy

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Use GitHub's private reporting instead: **Security → Report a vulnerability** on this repository. You can also contact [@TWadi](https://github.com/TWadi) directly. We're a small learning project, but we take reports seriously and will reply as soon as we can.

## How the platform is protected

- **The server decides.**
  - Quiz grading, duel clocks and winners, the "pass the quiz to complete a lecture" rule, membership and admin rights all run inside the database.
  - The browser can't fake them by calling the API directly.
- **Public API vs private internals.**
  - Answer keys, the question bank and the member/admin lists live in a `private` schema that the public API can't see.
  - A test fixes the exact set of exposed functions and tables, so accidental exposure fails CI.
- **Identity.**
  - Only accounts that signed in **with GitHub** (as recorded server-side by Supabase Auth) can become players or admins.
  - Being a player on the site never grants access to this repository.
- **Least privilege.** Visitors and signed-in users hold only the database privileges they need, and every table has row-level security.
- **No secrets in the repo.**
  - The site ships only Supabase's public "publishable" key, which is meant to be public; row-level security governs what it can do.
  - Real keys live in local `.env` files that git ignores.
  - GitHub secret scanning and push protection are on.
- **Tested.** CI replays every database migration on a fresh Postgres and runs security tests (impersonation, answer leaks, privilege checks) on every pull request.

See [docs/database.md](docs/database.md#6-security-model) for the full model.

## Known, accepted trade-offs

- Coding challenges are graded in the browser (Pyodide), so a reported solve is trusted.
- After submitting a quiz you see the answer key, so retaking can reveal the bank's answers.

Both are fine for a learning game among friends, and are documented in [ADR-0003](docs/adr/0003-server-authoritative-rules.md).
