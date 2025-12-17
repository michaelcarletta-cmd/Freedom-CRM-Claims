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
        const { workspace_id, target_instance_url, target_workspace_id, sync_secret } = payload;

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

        // Sync each claim to external instance with all related data
        const results = [];
        for (const claim of claims || []) {
          try {
            // Fetch all related data for this claim
            const [
              { data: tasks },
              { data: updates },
              { data: inspections },
              { data: adjusters },
              { data: settlements },
              { data: checks },
              { data: expenses },
              { data: fees },
              { data: files },
              { data: photos },
              { data: emails },
            ] = await Promise.all([
              supabase.from("tasks").select("*").eq("claim_id", claim.id),
              supabase.from("claim_updates").select("*").eq("claim_id", claim.id),
              supabase.from("inspections").select("*").eq("claim_id", claim.id),
              supabase.from("claim_adjusters").select("*").eq("claim_id", claim.id),
              supabase.from("claim_settlements").select("*").eq("claim_id", claim.id),
              supabase.from("claim_checks").select("*").eq("claim_id", claim.id),
              supabase.from("claim_expenses").select("*").eq("claim_id", claim.id),
              supabase.from("claim_fees").select("*").eq("claim_id", claim.id),
              supabase.from("claim_files").select("*").eq("claim_id", claim.id),
              supabase.from("claim_photos").select("*").eq("claim_id", claim.id),
              supabase.from("emails").select("*").eq("claim_id", claim.id),
            ]);

            console.log(`Syncing claim ${claim.id} with ${tasks?.length || 0} tasks, ${updates?.length || 0} updates, ${inspections?.length || 0} inspections, ${files?.length || 0} files`);

            // Generate signed URLs for files instead of downloading content (saves memory)
            const filesWithUrls = [];
            if (files && files.length > 0) {
              for (const file of files) {
                try {
                  const { data: signedUrlData, error: signError } = await supabase.storage
                    .from('claim-files')
                    .createSignedUrl(file.file_path, 3600); // 1 hour expiry
                  
                  if (!signError && signedUrlData) {
                    filesWithUrls.push({
                      ...file,
                      signed_url: signedUrlData.signedUrl,
                    });
                  } else {
                    console.error(`Failed to get signed URL for ${file.file_name}:`, signError);
                    filesWithUrls.push(file);
                  }
                } catch (err) {
                  console.error(`Error getting signed URL for ${file.file_name}:`, err);
                  filesWithUrls.push(file);
                }
              }
            }

            // Generate signed URLs for photos
            const photosWithUrls = [];
            if (photos && photos.length > 0) {
              for (const photo of photos) {
                try {
                  const { data: signedUrlData, error: signError } = await supabase.storage
                    .from('claim-files')
                    .createSignedUrl(photo.file_path, 3600);
                  
                  if (!signError && signedUrlData) {
                    photosWithUrls.push({
                      ...photo,
                      signed_url: signedUrlData.signedUrl,
                    });
                  } else {
                    console.error(`Failed to get signed URL for ${photo.file_name}:`, signError);
                    photosWithUrls.push(photo);
                  }
                } catch (err) {
                  console.error(`Error getting signed URL for ${photo.file_name}:`, err);
                  photosWithUrls.push(photo);
                }
              }
            }

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
                target_workspace_id: target_workspace_id || linkData.target_workspace_id,
                // Include all related data
                tasks_data: tasks || [],
                updates_data: updates || [],
                inspections_data: inspections || [],
                adjusters_data: adjusters || [],
                accounting_data: {
                  settlements: settlements || [],
                  checks: checks || [],
                  expenses: expenses || [],
                  fees: fees || [],
                },
                files_data: filesWithUrls,
                photos_data: photosWithUrls,
                emails_data: emails || [],
              }),
            });

            const responseText = await response.text();
            console.log(`Response from ${target_instance_url}: status=${response.status}, body=${responseText}`);
            
            let result;
            try {
              result = JSON.parse(responseText);
            } catch {
              result = { raw: responseText };
            }
            
            if (!response.ok) {
              console.error(`Sync failed for claim ${claim.id}: ${responseText}`);
              results.push({ claim_id: claim.id, success: false, error: responseText });
            } else {
              console.log(`Sync result for claim ${claim.id}:`, JSON.stringify(result));
              results.push({ claim_id: claim.id, success: true, result });
            }
          } catch (error: any) {
            console.error(`Error syncing claim ${claim.id}:`, error);
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
