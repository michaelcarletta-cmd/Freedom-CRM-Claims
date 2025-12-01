import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Look up signer and related request by access token
    const { data: signer, error: signerError } = await supabaseClient
      .from("signature_signers")
      .select("*, signature_requests(*)")
      .eq("access_token", token)
      .maybeSingle();

    if (signerError) {
      console.error("Error fetching signer:", signerError);
      throw signerError;
    }

    if (!signer || !signer.signature_requests) {
      return new Response(
        JSON.stringify({ error: "Signature request not found or link has expired" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const documentPath = signer.signature_requests.document_path;

    if (!documentPath) {
      return new Response(
        JSON.stringify({ error: "No document path configured for this request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: urlData, error: urlError } = await supabaseClient.storage
      .from("claim-files")
      .createSignedUrl(documentPath, 3600);

    if (urlError || !urlData?.signedUrl) {
      console.error("Error creating signed URL:", urlError);
      return new Response(
        JSON.stringify({ error: "Unable to generate document link" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ signedUrl: urlData.signedUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in get-signature-document function:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
