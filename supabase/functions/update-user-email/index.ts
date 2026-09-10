import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (
  body: Record<string, unknown>,
  status = 200
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { success: false, error: "Method not allowed" },
      405
    );
  }

  try {
    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse(
        { success: false, error: "Unauthorized" },
        401
      );
    }

    const accessToken = authorization.replace("Bearer ", "").trim();

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing Supabase server environment variables.");

      return jsonResponse(
        {
          success: false,
          error: "Server configuration error",
        },
        500
      );
    }

    // Client using the caller's JWT to identify the logged-in user.
    const supabaseAuth = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      }
    );

    const {
      data: { user: caller },
      error: callerError,
    } = await supabaseAuth.auth.getUser();

    if (callerError || !caller) {
      console.error("CALLER AUTH ERROR:", callerError);

      return jsonResponse(
        {
          success: false,
          error: "Invalid or expired session",
        },
        401
      );
    }

    // Privileged server-side client.
    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    // Verify that the caller is an active administrator.
    const { data: adminProfile, error: adminProfileError } =
      await supabaseAdmin
        .from("profiles")
        .select("id, is_admin, is_active")
        .eq("id", caller.id)
        .maybeSingle();

    if (adminProfileError) {
      console.error("ADMIN PROFILE ERROR:", adminProfileError);

      return jsonResponse(
        {
          success: false,
          error: "Unable to verify administrator permissions",
        },
        500
      );
    }

    if (
      !adminProfile ||
      adminProfile.is_admin !== true ||
      adminProfile.is_active !== true
    ) {
      return jsonResponse(
        {
          success: false,
          error: "Administrator access required",
        },
        403
      );
    }

    const body = await req.json();

    const userId =
      typeof body?.userId === "string"
        ? body.userId.trim()
        : "";

    const newEmail =
      typeof body?.newEmail === "string"
        ? body.newEmail.trim().toLowerCase()
        : "";

    if (!userId || !newEmail) {
      return jsonResponse(
        {
          success: false,
          error: "userId and newEmail are required",
        },
        400
      );
    }

    // Basic email validation.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(newEmail)) {
      return jsonResponse(
        {
          success: false,
          error: "Invalid email address",
        },
        400
      );
    }

    // Verify target profile exists.
    const { data: targetProfile, error: targetProfileError } =
      await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, store_id, is_active")
        .eq("id", userId)
        .maybeSingle();

    if (targetProfileError) {
      console.error("TARGET PROFILE ERROR:", targetProfileError);

      return jsonResponse(
        {
          success: false,
          error: "Unable to find target user",
        },
        500
      );
    }

    if (!targetProfile) {
      return jsonResponse(
        {
          success: false,
          error: "Target user was not found",
        },
        404
      );
    }

    // Avoid unnecessary Auth update.
    if (
      typeof targetProfile.email === "string" &&
      targetProfile.email.toLowerCase() === newEmail
    ) {
      return jsonResponse({
        success: true,
        message: "Email is already set to this address",
        userId,
        email: newEmail,
      });
    }

    console.log(
      `Admin ${caller.id} updating email for user ${userId}`
    );

    // Update Supabase Auth while preserving the same user ID.
    const { data: updatedAuthUser, error: authError } =
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        email: newEmail,
        email_confirm: true,
      });

    if (authError) {
      console.error("AUTH UPDATE ERROR:", authError);

      const message = authError.message ?? "Unable to update email";

      if (
        message.toLowerCase().includes("already") ||
        message.toLowerCase().includes("registered") ||
        message.toLowerCase().includes("duplicate")
      ) {
        return jsonResponse(
          {
            success: false,
            error: "This email is already registered to another account",
          },
          409
        );
      }

      return jsonResponse(
        {
          success: false,
          error: message,
        },
        400
      );
    }

    // Keep the application profile synchronized with Auth.
    const { error: profileUpdateError } =
      await supabaseAdmin
        .from("profiles")
        .update({
          email: newEmail,
        })
        .eq("id", userId);

    if (profileUpdateError) {
      console.error(
        "PROFILE EMAIL UPDATE ERROR:",
        profileUpdateError
      );

      // Auth was already changed, so return an explicit synchronization error.
      return jsonResponse(
        {
          success: false,
          error:
            "Auth email changed, but the profile email could not be synchronized",
          userId,
          email: newEmail,
        },
        500
      );
    }

    return jsonResponse({
      success: true,
      message: "User email updated successfully",
      userId: updatedAuthUser.user?.id ?? userId,
      email: newEmail,
    });
  } catch (error) {
    console.error("UPDATE USER EMAIL ERROR:", error);

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500
    );
  }
});
