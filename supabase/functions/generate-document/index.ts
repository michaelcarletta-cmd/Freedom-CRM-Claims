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
    const { templateId, claimId } = await req.json();

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch template
    const { data: template, error: templateError } = await supabaseClient
      .from("document_templates")
      .select("*")
      .eq("id", templateId)
      .single();

    if (templateError) throw templateError;

    // Fetch claim data
    const { data: claim, error: claimError } = await supabaseClient
      .from("claims")
      .select(`
        *,
        insurance_companies(name),
        loss_types(name),
        referrers(name, company),
        mortgage_companies(name, contact_name, phone, email)
      `)
      .eq("id", claimId)
      .single();

    if (claimError) throw claimError;

    // Download template file
    const { data: fileData, error: downloadError } = await supabaseClient.storage
      .from("document-templates")
      .download(template.file_path);

    if (downloadError) throw downloadError;

    // Convert blob to array buffer
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Use docxtemplater to fill the template
    // Import modules via CDN
    const PizZip = (await import("https://esm.sh/pizzip@3.1.4")).default;
    const Docxtemplater = (await import("https://esm.sh/docxtemplater@3.42.0")).default;

    const zip = new PizZip(uint8Array);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // Prepare data for template
    const templateData = {
      claim_number: claim.claim_number || "",
      policyholder_name: claim.policyholder_name || "",
      policyholder_email: claim.policyholder_email || "",
      policyholder_phone: claim.policyholder_phone || "",
      policyholder_address: claim.policyholder_address || "",
      policy_number: claim.policy_number || "",
      loss_date: claim.loss_date || "",
      loss_type: claim.loss_types?.name || claim.loss_type || "",
      loss_description: claim.loss_description || "",
      claim_amount: claim.claim_amount ? `$${claim.claim_amount.toLocaleString()}` : "",
      insurance_company: claim.insurance_companies?.name || claim.insurance_company || "",
      insurance_phone: claim.insurance_phone || "",
      insurance_email: claim.insurance_email || "",
      adjuster_name: claim.adjuster_name || "",
      adjuster_phone: claim.adjuster_phone || "",
      adjuster_email: claim.adjuster_email || "",
      referrer_name: claim.referrers?.name || "",
      referrer_company: claim.referrers?.company || "",
      mortgage_company: claim.mortgage_companies?.name || "",
      mortgage_contact: claim.mortgage_companies?.contact_name || "",
      mortgage_phone: claim.mortgage_companies?.phone || "",
      mortgage_email: claim.mortgage_companies?.email || "",
      status: claim.status || "",
      date: new Date().toLocaleDateString(),
    };

    // Render the document
    doc.render(templateData);

    // Generate the output file
    const outputBuffer = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    const fileName = `${claim.claim_number}-${template.name.replace(/\s+/g, "_")}.docx`;

    return new Response(
      JSON.stringify({
        content: outputBuffer,
        fileName,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error generating document:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
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
