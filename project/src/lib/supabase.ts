import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Types ────────────────────────────────────────────────────────────────────

export type RawShop = {
  id: number;
  shop_name: string;
  phone:     string;
  city:      string;
  owner_id:  string | null;
};

export type RawProduct = {
  id:          number;
  part_number: string;
  part_name:   string;
  brand:       string;
  model:       string;
};

export type RawInventory = {
  id:         number;
  shop_id:    number;
  product_id: number;
  quantity:   number;
  price:      number;
  updated_at: string;
};

export type MergedItem = {
  inventory_id: number;
  shop_id:      number;
  product_id:   number;
  quantity:     number;
  price:        number;
  updated_at:   string;
  // product fields
  part_number:  string;
  part_name:    string;
  brand:        string;
  model:        string;
  // shop fields
  shop_name:    string;
  shop_phone:   string;
  shop_city:    string;
  shop_found:   boolean; // هل وُجد المتجر؟
};

export type AvailabilityStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getAvailabilityStatus(qty: number): AvailabilityStatus {
  if (qty > 5)  return 'in_stock';
  if (qty >= 1) return 'low_stock';
  return 'out_of_stock';
}

export const availabilityBadge: Record<AvailabilityStatus, string> = {
  in_stock:     'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  low_stock:    'bg-amber-500/10  text-amber-400  border-amber-500/20',
  out_of_stock: 'bg-red-500/10    text-red-400    border-red-500/20',
};

// ─── Step 1: Load Shops ───────────────────────────────────────────────────────

export async function loadShops(): Promise<Map<number, RawShop>> {
  console.log('[loadShops] Starting...');

  const { data, error } = await supabase
    .from('shops')
    .select('*');

  if (error) {
    console.error('[loadShops] ERROR:', error.message);
    return new Map();
  }

  if (!data || data.length === 0) {
    console.warn('[loadShops] No shops returned');
    return new Map();
  }

  const map = new Map<number, RawShop>();
  for (const row of data) {
    const shop: RawShop = {
      id:        Number(row.id),
      shop_name: row.shop_name ?? 'متجر غير معروف',
      phone:     row.phone     ?? '',
      city:      row.city      ?? '',
      owner_id:  row.owner_id  ?? null,
    };
    map.set(shop.id, shop);
  }

  console.log(`[loadShops] Loaded ${map.size} shops:`, [...map.values()].map(s => s.shop_name));
  return map;
}

// ─── Step 2: Load Products ────────────────────────────────────────────────────

export async function loadProducts(): Promise<Map<number, RawProduct>> {
  console.log('[loadProducts] Starting...');

  const { data, error } = await supabase
    .from('products')
    .select('*');

  if (error) {
    console.error('[loadProducts] ERROR:', error.message);
    return new Map();
  }

  if (!data || data.length === 0) {
    console.warn('[loadProducts] No products returned');
    return new Map();
  }

  const map = new Map<number, RawProduct>();
  for (const row of data) {
    const product: RawProduct = {
      id:          Number(row.id),
      part_number: row.part_number ?? '',
      part_name:   row.part_name   ?? '',
      brand:       row.brand       ?? '',
      model:       row.model       ?? '',
    };
    map.set(product.id, product);
  }

  console.log(`[loadProducts] Loaded ${map.size} products`);
  return map;
}

// ─── Step 3: Load Inventory ───────────────────────────────────────────────────

export async function loadInventory(shopId?: number): Promise<RawInventory[]> {
  console.log('[loadInventory] Starting...', shopId ? `shopId=${shopId}` : 'all shops');

  let query = supabase.from('inventory').select('*');

  if (shopId) {
    query = query.eq('shop_id', shopId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[loadInventory] ERROR:', error.message);
    return [];
  }

  if (!data || data.length === 0) {
    console.warn('[loadInventory] No inventory rows returned');
    return [];
  }

  const rows: RawInventory[] = data.map(row => ({
    id:         Number(row.id),
    shop_id:    Number(row.shop_id),
    product_id: Number(row.product_id),
    quantity:   Number(row.quantity  ?? 0),
    price:      Number(row.price     ?? 0),
    updated_at: row.updated_at ?? '',
  }));

  console.log(`[loadInventory] Loaded ${rows.length} inventory rows`);
  return rows;
}

// ─── Step 4: Manual Merge ─────────────────────────────────────────────────────

export function mergeData(
  inventory:   RawInventory[],
  productMap:  Map<number, RawProduct>,
  shopMap:     Map<number, RawShop>,
): MergedItem[] {
  console.log(`[mergeData] Merging ${inventory.length} rows...`);

  const merged: MergedItem[] = [];
  let missingProduct = 0;
  let missingShop    = 0;

  for (const inv of inventory) {
    const product = productMap.get(inv.product_id);
    const shop    = shopMap.get(inv.shop_id);

    // ✅ لا نفلتر — نعرض الكل مع fallback
    if (!product) {
      missingProduct++;
      console.warn(`[mergeData] product_id=${inv.product_id} not found in products map`);
    }
    if (!shop) {
      missingShop++;
      console.warn(`[mergeData] shop_id=${inv.shop_id} not found in shops map`);
    }

    merged.push({
      inventory_id: inv.id,
      shop_id:      inv.shop_id,
      product_id:   inv.product_id,
      quantity:     inv.quantity,
      price:        inv.price,
      updated_at:   inv.updated_at,
      // product — fallback لو مش موجود
      part_number:  product?.part_number ?? `#${inv.product_id}`,
      part_name:    product?.part_name   ?? 'قطعة غير معروفة',
      brand:        product?.brand       ?? '',
      model:        product?.model       ?? '',
      // shop — fallback لو مش موجود
      shop_name:    shop?.shop_name ?? 'متجر غير معروف',
      shop_phone:   shop?.phone     ?? '',
      shop_city:    shop?.city      ?? '',
      shop_found:   !!shop,
    });
  }

  console.log(`[mergeData] Done. Total=${merged.length} | Missing products=${missingProduct} | Missing shops=${missingShop}`);
  return merged;
}

// ─── Step 5: Load Everything ──────────────────────────────────────────────────

export async function loadAll(shopId?: number): Promise<MergedItem[]> {
  console.log('=== [loadAll] Starting full data load ===');

  const [shopMap, productMap, inventory] = await Promise.all([
    loadShops(),
    loadProducts(),
    loadInventory(shopId),
  ]);

  if (inventory.length === 0) {
    console.warn('[loadAll] Inventory is empty — nothing to merge');
    return [];
  }

  const result = mergeData(inventory, productMap, shopMap);
  console.log(`=== [loadAll] Complete. ${result.length} items ready ===`);
  return result;
}

// ─── Search ───────────────────────────────────────────────────────────────────

export function searchMerged(items: MergedItem[], query: string): MergedItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  return items.filter(item =>
    item.part_number.toLowerCase().includes(q) ||
    item.part_name.toLowerCase().includes(q)   ||
    item.brand.toLowerCase().includes(q)        ||
    item.model.toLowerCase().includes(q)        ||
    item.shop_name.toLowerCase().includes(q)
  );
}