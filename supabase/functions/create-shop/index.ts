import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json();

    console.log("REQUEST BODY:", body);

    const {
      shop_name,
      owner_name,
      email,
      password,
      phone,
      city,
    } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log("Creating Auth User...");

    const { data: authUser, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError) {
      console.error("AUTH ERROR:", authError);
      throw authError;
    }

    console.log("Auth User Created:", authUser.user.id);

    console.log("Creating Shop...");

    const { data: shop, error: shopError } =
      await supabase
        .from("shops")
        .insert({
          shop_name,
          phone,
          city,
          owner_id: authUser.user.id,
          is_active: true,
          subscription_status: "trial",
        })
        .select()
        .single();

    if (shopError) {
      console.error("SHOP ERROR:", shopError);
      throw shopError;
    }

    console.log("Shop Created:", shop.id);

    console.log("Upserting Profile...");

    const { error: profileError } =
      await supabase
        .from("profiles")
        .upsert({
          id: authUser.user.id,
          role: "shop_owner",
          full_name: owner_name,
          phone,
          email,
          store_id: shop.id,
          is_active: true,
          is_admin: false,
        });

    if (profileError) {
      console.error("PROFILE ERROR:", profileError);
      throw profileError;
    }

    console.log("Profile Upserted Successfully");

    return new Response(
      JSON.stringify({
        success: true,
        shop_id: shop.id,
        owner_id: authUser.user.id,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("CREATE SHOP ERROR:", err);

    return new Response(
      JSON.stringify({
        success: false,
        error: String(err),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});