import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const { shop_name, phone, city, email, password, owner_name } =
      await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1) إنشاء المستخدم
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (userError) {
      throw userError;
    }

    const userId = userData.user.id;

    // 2) إنشاء المحل
    const { data: shopData, error: shopError } = await supabaseAdmin
      .from("shops")
      .insert({
        shop_name,
        phone,
        city,
        owner_id: userId,
        is_active: true,
        subscription_status: "active",
      })
      .select()
      .single();

    if (shopError) {
      throw shopError;
    }

    // 3) إنشاء البروفايل
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: userId,
        full_name: owner_name,
        email,
        phone,
        role: "shop_owner",
        store_id: shopData.id,
        is_active: true,
        is_admin: false,
      });

    if (profileError) {
      throw profileError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        shop_id: shopData.id,
        user_id: userId,
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
});