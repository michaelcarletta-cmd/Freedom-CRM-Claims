import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { userId, email } = await req.json();

    let targetUserId = userId;

    // If email is provided but no userId, look up the user by email
    if (!targetUserId && email) {
      console.log("Looking up user by email:", email);
      
      // List users and find by email
      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      
      if (listError) {
        console.error("Error listing users:", listError);
        return new Response(
          JSON.stringify({ error: listError.message }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const user = users.find(u => u.email === email);
      if (user) {
        targetUserId = user.id;
        console.log("Found user ID:", targetUserId);
      } else {
        console.log("No user found with email:", email);
        return new Response(
          JSON.stringify({ success: true, message: "No user found with that email" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    if (!targetUserId) {
      return new Response(
        JSON.stringify({ error: "Missing userId or email" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Deleting user:", targetUserId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);

    if (error) {
      console.error("Error deleting user:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("User deleted successfully:", targetUserId);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in delete-user:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
