/*
  # Seed Sample Data for Isuzu Spare Parts Platform

  ## Overview
  Inserts sample shops and products for demonstration purposes.
  Inventory records are linked to shops and products.

  ## Notes
  - Sample shops are inserted without owner_id (admin-managed shops for demo)
  - Products use real Isuzu part number formats
  - Inventory quantities demonstrate all three availability states
*/

-- Insert sample shops
INSERT INTO shops (id, name, name_ar, phone, city, city_ar, address, is_active) VALUES
  ('a1b2c3d4-0001-0001-0001-000000000001', 'Al-Riyad Auto Parts', 'الرياض لقطع السيارات', '+966-11-234-5678', 'Riyadh', 'الرياض', 'King Fahd Road, Al Olaya District', true),
  ('a1b2c3d4-0002-0002-0002-000000000002', 'Jeddah Truck Spares', 'جدة لقطع الشاحنات', '+966-12-345-6789', 'Jeddah', 'جدة', 'Corniche Road, Al Hamra District', true),
  ('a1b2c3d4-0003-0003-0003-000000000003', 'Dammam Heavy Parts', 'الدمام للقطع الثقيلة', '+966-13-456-7890', 'Dammam', 'الدمام', 'Prince Mohammed Bin Fahd Road', true),
  ('a1b2c3d4-0004-0004-0004-000000000004', 'Makkah Auto Center', 'مكة لمركز السيارات', '+966-12-567-8901', 'Makkah', 'مكة المكرمة', 'Ibrahim Al Khalil Road', true),
  ('a1b2c3d4-0005-0005-0005-000000000005', 'Medina Parts Hub', 'المدينة لمحور القطع', '+966-14-678-9012', 'Medina', 'المدينة المنورة', 'King Abdul Aziz Road', true)
ON CONFLICT (id) DO NOTHING;

-- Insert sample products
INSERT INTO products (id, part_number, name, name_ar, category, category_ar, description) VALUES
  ('b1b2c3d4-0001-0001-0001-000000000001', '8-98005311-0', 'Engine Oil Filter', 'فلتر زيت المحرك', 'Engine', 'المحرك', 'Isuzu 4HK1 Engine Oil Filter'),
  ('b1b2c3d4-0002-0002-0002-000000000002', '8-97176992-0', 'Air Filter Element', 'عنصر فلتر الهواء', 'Engine', 'المحرك', 'Air filter for Isuzu NQR/NPR series'),
  ('b1b2c3d4-0003-0003-0003-000000000003', '1-87619073-0', 'Fuel Filter', 'فلتر الوقود', 'Fuel System', 'نظام الوقود', 'Primary fuel filter element'),
  ('b1b2c3d4-0004-0004-0004-000000000004', '1-86625015-0', 'Brake Pad Set', 'طقم تيل الفرامل', 'Brakes', 'الفرامل', 'Front brake pad set for Isuzu trucks'),
  ('b1b2c3d4-0005-0005-0005-000000000005', '8-97354602-0', 'Water Pump', 'مضخة الماء', 'Cooling System', 'نظام التبريد', 'Engine water pump assembly'),
  ('b1b2c3d4-0006-0006-0006-000000000006', '1-09637013-0', 'Timing Belt Kit', 'طقم سير التوقيت', 'Engine', 'المحرك', 'Complete timing belt kit'),
  ('b1b2c3d4-0007-0007-0007-000000000007', '8-98076761-0', 'Alternator', 'مولد الكهرباء', 'Electrical', 'الكهرباء', '24V alternator for Isuzu diesel engines'),
  ('b1b2c3d4-0008-0008-0008-000000000008', '1-87612013-0', 'Clutch Disc', 'قرص القابض', 'Transmission', 'ناقل الحركة', 'Clutch friction disc assembly'),
  ('b1b2c3d4-0009-0009-0009-000000000009', '8-94391978-0', 'Radiator Hose Upper', 'خرطوم الرادياتير العلوي', 'Cooling System', 'نظام التبريد', 'Upper radiator coolant hose'),
  ('b1b2c3d4-0010-0010-0010-000000000010', '5-87611011-0', 'Starter Motor', 'موتور بدء التشغيل', 'Electrical', 'الكهرباء', '24V starter motor for heavy duty trucks')
ON CONFLICT (part_number) DO NOTHING;

-- Insert inventory records
INSERT INTO inventory (shop_id, product_id, quantity, price) VALUES
  -- Al-Riyad Auto Parts
  ('a1b2c3d4-0001-0001-0001-000000000001', 'b1b2c3d4-0001-0001-0001-000000000001', 15, 85.00),
  ('a1b2c3d4-0001-0001-0001-000000000001', 'b1b2c3d4-0002-0002-0002-000000000002', 8, 120.00),
  ('a1b2c3d4-0001-0001-0001-000000000001', 'b1b2c3d4-0003-0003-0003-000000000003', 3, 65.00),
  ('a1b2c3d4-0001-0001-0001-000000000001', 'b1b2c3d4-0004-0004-0004-000000000004', 0, 380.00),
  ('a1b2c3d4-0001-0001-0001-000000000001', 'b1b2c3d4-0005-0005-0005-000000000005', 6, 450.00),
  -- Jeddah Truck Spares
  ('a1b2c3d4-0002-0002-0002-000000000002', 'b1b2c3d4-0001-0001-0001-000000000001', 2, 90.00),
  ('a1b2c3d4-0002-0002-0002-000000000002', 'b1b2c3d4-0003-0003-0003-000000000003', 12, 70.00),
  ('a1b2c3d4-0002-0002-0002-000000000002', 'b1b2c3d4-0004-0004-0004-000000000004', 7, 360.00),
  ('a1b2c3d4-0002-0002-0002-000000000002', 'b1b2c3d4-0006-0006-0006-000000000006', 4, 280.00),
  ('a1b2c3d4-0002-0002-0002-000000000002', 'b1b2c3d4-0007-0007-0007-000000000007', 1, 1200.00),
  -- Dammam Heavy Parts
  ('a1b2c3d4-0003-0003-0003-000000000003', 'b1b2c3d4-0001-0001-0001-000000000001', 0, 88.00),
  ('a1b2c3d4-0003-0003-0003-000000000003', 'b1b2c3d4-0005-0005-0005-000000000005', 3, 470.00),
  ('a1b2c3d4-0003-0003-0003-000000000003', 'b1b2c3d4-0007-0007-0007-000000000007', 9, 1150.00),
  ('a1b2c3d4-0003-0003-0003-000000000003', 'b1b2c3d4-0008-0008-0008-000000000008', 5, 650.00),
  ('a1b2c3d4-0003-0003-0003-000000000003', 'b1b2c3d4-0009-0009-0009-000000000009', 20, 95.00),
  -- Makkah Auto Center
  ('a1b2c3d4-0004-0004-0004-000000000004', 'b1b2c3d4-0002-0002-0002-000000000002', 0, 125.00),
  ('a1b2c3d4-0004-0004-0004-000000000004', 'b1b2c3d4-0004-0004-0004-000000000004', 2, 395.00),
  ('a1b2c3d4-0004-0004-0004-000000000004', 'b1b2c3d4-0006-0006-0006-000000000006', 11, 265.00),
  ('a1b2c3d4-0004-0004-0004-000000000004', 'b1b2c3d4-0010-0010-0010-000000000010', 6, 1800.00),
  -- Medina Parts Hub
  ('a1b2c3d4-0005-0005-0005-000000000005', 'b1b2c3d4-0003-0003-0003-000000000003', 4, 68.00),
  ('a1b2c3d4-0005-0005-0005-000000000005', 'b1b2c3d4-0008-0008-0008-000000000008', 0, 680.00),
  ('a1b2c3d4-0005-0005-0005-000000000005', 'b1b2c3d4-0009-0009-0009-000000000009', 8, 100.00),
  ('a1b2c3d4-0005-0005-0005-000000000005', 'b1b2c3d4-0010-0010-0010-000000000010', 1, 1850.00)
ON CONFLICT (shop_id, product_id) DO NOTHING;
