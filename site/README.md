# Lab website

Public progress page at **https://twadi.github.io/ai-engineering-arena/**.

- **Frontend:** Vite + React + TypeScript in this folder, deployed to GitHub Pages by `.github/workflows/pages.yml` on every push to `main` that touches `site/`.
- **Backend:** Supabase (Postgres + GitHub login). Schema and access rules are in `../supabase/migrations/`.
- **Who can do what:** anyone can view progress. Only GitHub users listed in the `members` table (`TWadi`, `GhassenJamoussi99`, `bravo421`) can tick items, and only their own.

## Develop locally

```bash
cd site
npm install
cp .env.example .env.local   # fill in the two Supabase values
npm run dev                  # http://localhost:5173/ai-engineering-arena/
npm test
```

## The roadmap

Roadmap content lives in `src/roadmap.ts`. Item ids (`p3-4`) are stored in the database, so never rename one: add a new id and remove the old item instead.

## One-time Supabase setup

1. Create a free project at https://supabase.com (region: Frankfurt).
2. **SQL Editor → New query:** paste `supabase/migrations/20261004120000_progress.sql` and run it.
3. **GitHub OAuth app:** GitHub → Settings → Developer settings → OAuth Apps → New.
   - Homepage URL: `https://twadi.github.io/ai-engineering-arena/`
   - Authorization callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`
4. **Supabase → Authentication → Sign In / Providers → GitHub:** enable, paste the OAuth app's Client ID and Client secret.
5. **Supabase → Authentication → URL Configuration:**
   - Site URL: `https://twadi.github.io/ai-engineering-arena/`
   - Redirect URLs: add `https://twadi.github.io/ai-engineering-arena/` and `http://localhost:5173/ai-engineering-arena/`
6. **GitHub repo → Settings → Secrets and variables → Actions → Variables:** add `SUPABASE_URL` and `SUPABASE_ANON_KEY` (Supabase → Project Settings → API). These are public values; never put the `service_role` key anywhere in this repo.

To add a member later, run in the SQL editor:

```sql
insert into public.members values ('their-github-username');
update public.profiles set is_member = true where github_username = 'their-github-username';
```
