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

    const { action, ...payload } = await req.json();
    console.log("Workspace sync action:", action, payload);

    // Handle different sync actions
    switch (action) {
      case "register_link": {
        // External instance registering to receive workspace syncs
        const { workspace_id, external_instance_url, instance_name, sync_secret } = payload;
        
        // Validate required fields
        if (!workspace_id || !external_instance_url || !instance_name || !sync_secret) {
          throw new Error("Missing required fields for link registration");
        }

        // Check if already linked
        const { data: existing } = await supabase
          .from("linked_workspaces")
          .select("id")
          .eq("workspace_id", workspace_id)
          .eq("external_instance_url", external_instance_url)
          .maybeSingle();

        if (existing) {
          return new Response(
            JSON.stringify({ success: true, message: "Already linked", link_id: existing.id }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Create the link
        const { data: link, error: linkError } = await supabase
          .from("linked_workspaces")
          .insert({
            workspace_id,
            external_instance_url,
            instance_name,
            sync_secret,
            sync_status: "active",
          })
          .select()
          .single();

        if (linkError) throw linkError;

        return new Response(
          JSON.stringify({ success: true, link_id: link.id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "sync_claims": {
        // Sync claims from workspace to external instance
        const { workspace_id, target_instance_url, sync_secret } = payload;

        // Verify sync secret
        const { data: linkData } = await supabase
          .from("linked_workspaces")
          .select("*")
          .eq("workspace_id", workspace_id)
          .eq("external_instance_url", target_instance_url)
          .eq("sync_secret", sync_secret)
          .maybeSingle();

        if (!linkData) {
          throw new Error("Invalid sync credentials");
        }

        // Get all claims in workspace
        const { data: claims, error: claimsError } = await supabase
          .from("claims")
          .select("*")
          .eq("workspace_id", workspace_id);

        if (claimsError) throw claimsError;

        // Sync each claim to external instance
        const results = [];
        for (const claim of claims || []) {
          try {
            const response = await fetch(`${target_instance_url}/functions/v1/claim-sync-webhook`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-claim-sync-secret": sync_secret,
              },
              body: JSON.stringify({
                action: "create_or_update",
                claim_data: claim,
                external_claim_id: claim.id,
                source_instance_url: supabaseUrl,
              }),
            });

            const result = await response.json();
            results.push({ claim_id: claim.id, success: true, result });
          } catch (error: any) {
            results.push({ claim_id: claim.id, success: false, error: error.message });
          }
        }

        // Update last synced timestamp
        await supabase
          .from("linked_workspaces")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", linkData.id);

        return new Response(
          JSON.stringify({ success: true, synced_claims: results }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "receive_workspace_invite": {
        // Handle incoming workspace invite from another instance
        const syncSecret = req.headers.get("x-workspace-sync-secret");
        const expectedSecret = Deno.env.get("CLAIM_SYNC_SECRET");

        if (syncSecret !== expectedSecret) {
          return new Response(
            JSON.stringify({ success: false, error: "Invalid sync secret" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { source_workspace_id, source_instance_url, source_instance_name, workspace_name } = payload;

        // Store the incoming workspace link for display
        // The external instance will handle claim sync separately
        console.log("Received workspace invite from:", source_instance_name, "workspace:", workspace_name);

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Workspace invite received",
            workspace_name,
            source_instance_name 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error: any) {
    console.error("Workspace sync error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
