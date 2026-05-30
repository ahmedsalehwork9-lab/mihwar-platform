# Shop owner setup guide

This guide creates **5 shop owner accounts**, links each shop to its owner, and relies on **RLS** so owners only see their own inventory.

## Prerequisites

1. Run migrations in order (Supabase Dashboard → **SQL Editor**):
   - `supabase/migrations/20260523155314_create_isuzu_platform_schema.sql`
   - `supabase/migrations/20260523155351_seed_sample_data.sql`
   - `supabase/migrations/20260524110000_rbac_profiles_and_policies.sql`

2. Confirm **Email** provider is enabled: **Authentication** → **Providers** → Email.

---

## Step 1 — Create users in Supabase Auth

For each row, go to **Authentication** → **Users** → **Add user** → **Create new user**:

| Shop | Email | Password |
|------|-------|----------|
| Al-Riyad Auto Parts | `riyad@isuzuparts.sa` | `Shop@1234` |
| Jeddah Truck Spares | `jeddah@isuzuparts.sa` | `Shop@1234` |
| Dammam Parts Center | `dammam@isuzuparts.sa` | `Shop@1234` |
| Mecca Heavy Parts | `mecca@isuzuparts.sa` | `Shop@1234` |
| Madinah Auto Store | `madinah@isuzuparts.sa` | `Shop@1234` |

For each user:

- Turn on **Auto Confirm User** (so they can log in immediately).
- Save.

> **Security:** Change `Shop@1234` in production. This password is for demo/dev only.

### Optional — Create users via Admin API (service role)

If you prefer the API, run from a secure environment (never expose the service role key in the frontend):

```bash
# Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY
BASE="https://YOUR_PROJECT_REF.supabase.co/auth/v1/admin/users"
KEY="YOUR_SERVICE_ROLE_KEY"

create_user() {
  curl -s -X POST "$BASE" \
    -H "apikey: $KEY" \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"Shop@1234\",\"email_confirm\":true}"
}

create_user "riyad@isuzuparts.sa"
create_user "jeddah@isuzuparts.sa"
create_user "dammam@isuzuparts.sa"
create_user "mecca@isuzuparts.sa"
create_user "madinah@isuzuparts.sa"
```

---

## Step 2 — Link shops and profiles (SQL)

Open **SQL Editor** and run:

`supabase/migrations/20260524120000_link_shop_owners.sql`

This script:

1. Updates shop names to match your list.
2. Sets `profiles.role = 'shop_owner'` for each email.
3. Sets `shops.owner_id` to the matching `auth.users.id`.

### Verify linking

```sql
SELECT
  s.name AS shop,
  u.email AS owner_email,
  p.role,
  (SELECT count(*) FROM inventory i WHERE i.shop_id = s.id) AS inventory_rows
FROM shops s
LEFT JOIN auth.users u ON u.id = s.owner_id
LEFT JOIN profiles p ON p.id = s.owner_id
ORDER BY s.name;
```

Every shop should have an `owner_email` and `role = shop_owner`.

---

## Step 3 — How RLS enforces access

Already defined in `20260524110000_rbac_profiles_and_policies.sql`:

| Role | Shops | Inventory |
|------|-------|-----------|
| **admin** | All shops | All rows |
| **shop_owner** | Only shop where `owner_id = auth.uid()` | Only rows for that shop |

Shop owners **cannot** read other shops or other shops’ inventory, even if they guess UUIDs.

---

## Step 4 — Test each owner

1. Log out of the app.
2. Log in as `riyad@isuzuparts.sa` / `Shop@1234`.
3. Open **Dashboard**, **Inventory**, and **Search** — you should only see **Al-Riyad Auto Parts** data.
4. Repeat for the other four emails.

---

## Optional — Create an admin user

1. Create a user in Auth, e.g. `admin@isuzuparts.sa`.
2. Run:

```sql
INSERT INTO profiles (id, role)
SELECT id, 'admin'::user_role
FROM auth.users
WHERE email = 'admin@isuzuparts.sa'
ON CONFLICT (id) DO UPDATE SET role = 'admin'::user_role;
```

Admins see all shops and can use the **filter by shop** on the Inventory page.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Owner sees no data | Run the link SQL; check `shops.owner_id` is set for that user’s UUID. |
| `profiles` row missing | Run link SQL or sign up again (trigger creates profile on insert). |
| Login fails | Confirm user exists and **Auto Confirm** is on. |
| Still sees all shops | Confirm `20260524110000_rbac_profiles_and_policies.sql` ran; old permissive policies may still exist — re-run that migration. |

---

## Shop ↔ owner reference

| Shop ID | Shop name | Owner email |
|---------|-----------|-------------|
| `a1b2c3d4-0001-0001-0001-000000000001` | Al-Riyad Auto Parts | riyad@isuzuparts.sa |
| `a1b2c3d4-0002-0002-0002-000000000002` | Jeddah Truck Spares | jeddah@isuzuparts.sa |
| `a1b2c3d4-0003-0003-0003-000000000003` | Dammam Parts Center | dammam@isuzuparts.sa |
| `a1b2c3d4-0004-0004-0004-000000000004` | Mecca Heavy Parts | mecca@isuzuparts.sa |
| `a1b2c3d4-0005-0005-0005-000000000005` | Madinah Auto Store | madinah@isuzuparts.sa |
