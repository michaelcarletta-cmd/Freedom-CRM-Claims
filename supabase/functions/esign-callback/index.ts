import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log("Received e-sign callback:", JSON.stringify(body));

    const {
      crm_contract_id,
      signnow_document_id,
      status,
      signing_link,
      signed_pdf_url,
      audit_url,
      error_message,
    } = body;

    if (!crm_contract_id) {
      return new Response(
        JSON.stringify({ error: "crm_contract_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map incoming status to our internal status values
    const statusMap: Record<string, string> = {
      sent: "sent",
      viewed: "viewed",
      completed: "completed",
      signed: "completed",
      declined: "declined",
      error: "error",
    };

    const internalStatus = statusMap[status?.toLowerCase()] || status;

    // Build the update object
    const updateData: Record<string, any> = {
      esign_status: internalStatus,
      updated_at: new Date().toISOString(),
    };

    if (signnow_document_id) {
      updateData.esign_document_id = signnow_document_id;
      updateData.esign_provider = "signnow";
    }

    if (signing_link) {
      updateData.esign_signing_link = signing_link;
    }

    if (internalStatus === "sent" && !body.esign_sent_at) {
      updateData.esign_sent_at = new Date().toISOString();
    }

    if (internalStatus === "completed") {
      updateData.esign_completed_at = new Date().toISOString();
      if (signed_pdf_url) updateData.signed_pdf_url = signed_pdf_url;
      if (audit_url) updateData.esign_audit_url = audit_url;
    }

    if (internalStatus === "error" && error_message) {
      updateData.esign_error_message = error_message;
    }

    // Update the claim
    const { error: updateError } = await supabase
      .from("claims")
      .update(updateData)
      .eq("id", crm_contract_id);

    if (updateError) {
      console.error("Error updating claim:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update claim", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log the event to claim_updates
    const statusMessages: Record<string, string> = {
      sent: "📧 Signature request sent via SignNow",
      viewed: "👁️ Document viewed by signer",
      completed: "✅ Document signed successfully",
      declined: "❌ Signature declined",
      error: `⚠️ E-sign error: ${error_message || "Unknown error"}`,
    };

    await supabase.from("claim_updates").insert({
      claim_id: crm_contract_id,
      content: statusMessages[internalStatus] || `E-sign status: ${status}`,
      update_type: "esign",
    });

    // Update claim timestamp
    await supabase
      .from("claims")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", crm_contract_id);

    console.log(`Successfully updated claim ${crm_contract_id} with status ${internalStatus}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        claim_id: crm_contract_id,
        status: internalStatus 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in esign-callback:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
