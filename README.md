# Aramis Product (rms-small)

Multi-tenant SaaS counter for small cafés & restaurants.

## Modules

| Module | Includes |
|--------|----------|
| **Inventory** | Menu, stock (+ cost history), recipes, cashier / order POS |
| **Finance** | Period sales reports, accountant day-close + payment proofs |

Module flags (kitchen, online, inventory, and so on) are set by **Aramis platform admin** when a restaurant is approved or a payment proof is reviewed. Owners request a package in **Billing**; they cannot unlock modules themselves.

## Lifecycle

1. Sign up / sign in (Supabase Auth)
2. Onboard business → choose requested modules → platform approval → **14-day trial**
3. Use enabled modules
4. After trial: upload payment proof in Billing; platform activates the period

## Stack

- Next.js 16 + React 19
- Supabase (Auth, Postgres, Storage)
- Project: `uwtqbqtryozeboafzgwo` (eu-north-1)

## Run

```bash
cp .env.example .env.local   # fill keys
pnpm install                 # or npm install
pnpm dev                     # http://localhost:7778
```

Language (English / አማርኛ) is on the sign-in and signup screens, and under **Settings → Appearance**.

## Tests

```bash
npm test                     # unit tests
npm run test:rls             # live RLS against your .env.local project
```

`test:rls` needs `RLS_LIVE_TEST=1` plus `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. It creates throwaway users named `rls-*-@aramis.test` and deletes them after.

## Offline & installable app (PWA)

- Connection is probed every **5 seconds** (`/api/health`).
- When the link is down, sales and edits are stored in IndexedDB and queued.
- When the connection is **up** (including slow), pending work syncs automatically and a **popup** confirms success. You can also tap **Sync now**.
- Install from the sidebar (**Install app**) on desktop Chrome/Edge, Android, or iOS (Share → Add to Home Screen).

## Brand

**Aramis Product** — ink / teal / gold UI, mobile-first shell.
