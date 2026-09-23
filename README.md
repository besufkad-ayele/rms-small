# Aramis Product (rms-small)

Multi-tenant SaaS counter for small cafés & restaurants.

## Modules

| Module | Includes |
|--------|----------|
| **Inventory** | Menu, stock (+ cost history), recipes, cashier / order POS |
| **Finance** | Period sales reports, accountant day-close + payment proofs |

Owners pick modules at onboarding and can change them in **Billing**.

## Lifecycle

1. Sign up / sign in (Supabase Auth)
2. Onboard business → choose modules → **14-day trial**
3. Use enabled modules
4. After trial: upload payment proof in Billing to activate

## Stack

- Next.js 16 + React 19
- Supabase (Auth, Postgres, Storage)
- Project: `uwtqbqtryozeboafzgwo` (eu-north-1)

## Run

```bash
cp .env.example .env.local   # fill keys
npm install
npm run dev                  # http://localhost:7778
```

## Brand

**Aramis Product** — ink / teal / gold UI, mobile-first shell.
