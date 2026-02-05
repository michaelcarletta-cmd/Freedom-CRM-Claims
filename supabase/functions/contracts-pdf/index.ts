import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    const claimId = pathParts[pathParts.length - 2]; // /contracts/{claimId}/pdf

    if (!claimId) {
      return new Response(
        JSON.stringify({ error: "Claim ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get claim and check for contract PDF
    const { data: claim, error: claimError } = await supabase
      .from("claims")
      .select("id, claim_number, contract_pdf_path")
      .eq("id", claimId)
      .single();

    if (claimError || !claim) {
      return new Response(
        JSON.stringify({ error: "Claim not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!claim.contract_pdf_path) {
      return new Response(
        JSON.stringify({ error: "No contract PDF available for this claim" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate a signed URL for the PDF (valid for 1 hour)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("claim-files")
      .createSignedUrl(claim.contract_pdf_path, 3600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      return new Response(
        JSON.stringify({ error: "Failed to generate PDF URL" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return redirect to the signed URL or the URL itself
    const format = url.searchParams.get("format");
    
    if (format === "url") {
      return new Response(
        JSON.stringify({ 
          pdf_url: signedUrlData.signedUrl,
          claim_number: claim.claim_number,
          expires_in: 3600
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Redirect to the PDF
    return Response.redirect(signedUrlData.signedUrl, 302);
    
  } catch (error: unknown) {
    console.error("Error in contracts-pdf:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
