# Moneta Workspace Rules

## Architecture & Deployment Invariants (Vercel + Supabase)
- **Dual-Mode Storage (`server/store.js`):** Lazy-import `node:sqlite` only when `DATABASE_URL` is absent so Vercel Serverless never loads SQLite in production.
- **Supabase Pooler Compatibility:** Use standard parameterized `pg` queries without named prepared statements so both Transaction Pooler (port `6543`) and Session Pooler work reliably.
- **Multi-User Isolation:** Every query on `accounts`, `transactions`, `budgets`, and `goals` must be strictly scoped by `user_id = req.userId`.
- **Never Commit Secrets:** Keep `.env` and `server/data/` excluded via `.gitignore`; document required env vars in `.env.example`.

## Moneta UI Identity
- **Theme Lineup:** Maintain all 6 switchable themes (`Modern` with electric lime accent on crisp light Revolut-inspired surfaces, calm `Dark`, `Cool`, `Calm`, `Cute`, `Lavender`) persisted in `localStorage`.
- **Verification:** Run `npm test` and `npm run build` before pushing updates to `origin/main` (auto-deploys to Vercel).
