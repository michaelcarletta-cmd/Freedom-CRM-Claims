import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-workspace-sync-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate sync secret
    const syncSecret = req.headers.get("x-workspace-sync-secret");
    const expectedSecret = Deno.env.get("CLAIM_SYNC_SECRET");

    if (!syncSecret || syncSecret !== expectedSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid sync secret" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Fetching staff and admin users for external instance");

    // Get all users who have staff or admin roles and are approved
    const { data: userRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "staff"]);

    if (rolesError) {
      console.error("Error fetching user roles:", rolesError);
      throw rolesError;
    }

    // Get unique user IDs
    const userIds = [...new Set(userRoles?.map((r) => r.user_id) || [])];

    if (userIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, users: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get profile info for these users
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds)
      .eq("approval_status", "approved");

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw profilesError;
    }

    // Combine profile info with roles
    const users = profiles?.map((profile) => {
      const roles = userRoles?.filter((r) => r.user_id === profile.id).map((r) => r.role) || [];
      return {
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        roles,
      };
    }) || [];

    console.log(`Found ${users.length} staff/admin users`);

    return new Response(
      JSON.stringify({ success: true, users }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in get-instance-users:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
