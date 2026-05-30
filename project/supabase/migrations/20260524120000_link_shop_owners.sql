/*
  # Link shop owners to shops

  PREREQUISITE: Create the 5 users in Supabase Auth first (see docs/SHOP_OWNERS_SETUP.md).
  Then run this script in the Supabase SQL Editor.

  - Renames shops to match the platform naming
  - Sets profiles.role = shop_owner for each owner email
  - Sets shops.owner_id for each shop
*/

-- Align shop display names with the platform
UPDATE shops SET name = 'Al-Riyad Auto Parts' WHERE id = 'a1b2c3d4-0001-0001-0001-000000000001';
UPDATE shops SET name = 'Jeddah Truck Spares' WHERE id = 'a1b2c3d4-0002-0002-0002-000000000002';
UPDATE shops SET name = 'Dammam Parts Center', name_ar = 'مركز الدمام لقطع الغيار' WHERE id = 'a1b2c3d4-0003-0003-0003-000000000003';
UPDATE shops SET name = 'Mecca Heavy Parts', name_ar = 'مكة للقطع الثقيلة' WHERE id = 'a1b2c3d4-0004-0004-0004-000000000004';
UPDATE shops SET name = 'Madinah Auto Store', name_ar = 'متجر المدينة للسيارات' WHERE id = 'a1b2c3d4-0005-0005-0005-000000000005';

-- Ensure profiles exist and are shop_owner (trigger may have created them on signup)
INSERT INTO profiles (id, role)
SELECT u.id, 'shop_owner'::user_role
FROM auth.users u
WHERE u.email IN (
  'riyad@isuzuparts.sa',
  'jeddah@isuzuparts.sa',
  'dammam@isuzuparts.sa',
  'mecca@isuzuparts.sa',
  'madinah@isuzuparts.sa'
)
ON CONFLICT (id) DO UPDATE SET role = 'shop_owner'::user_role;

-- Link each shop to its owner (one shop per owner)
UPDATE shops
SET owner_id = (SELECT id FROM auth.users WHERE email = 'riyad@isuzuparts.sa')
WHERE id = 'a1b2c3d4-0001-0001-0001-000000000001';

UPDATE shops
SET owner_id = (SELECT id FROM auth.users WHERE email = 'jeddah@isuzuparts.sa')
WHERE id = 'a1b2c3d4-0002-0002-0002-000000000002';

UPDATE shops
SET owner_id = (SELECT id FROM auth.users WHERE email = 'dammam@isuzuparts.sa')
WHERE id = 'a1b2c3d4-0003-0003-0003-000000000003';

UPDATE shops
SET owner_id = (SELECT id FROM auth.users WHERE email = 'mecca@isuzuparts.sa')
WHERE id = 'a1b2c3d4-0004-0004-0004-000000000004';

UPDATE shops
SET owner_id = (SELECT id FROM auth.users WHERE email = 'madinah@isuzuparts.sa')
WHERE id = 'a1b2c3d4-0005-0005-0005-000000000005';

-- Verification query (run manually after script)
-- SELECT s.name, s.owner_id, u.email, p.role
-- FROM shops s
-- LEFT JOIN auth.users u ON u.id = s.owner_id
-- LEFT JOIN profiles p ON p.id = s.owner_id
-- ORDER BY s.name;
