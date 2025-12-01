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
      delimiters: {
        start: "${",
        end: "}"
      }
    });

    // Parse address from policyholder_address field
    const addressParts = (claim.policyholder_address || "").split(",").map((s: string) => s.trim());
    const street = addressParts[0] || "";
    const city = addressParts[1] || "";
    const stateZip = (addressParts[2] || "").split(" ");
    const state = stateZip[0] || "";
    const zipCode = stateZip[1] || "";

    // Prepare data for template matching the ${field} format
    const templateData = {
      // Main claim info
      claim: {
        claim_number: claim.claim_number || "",
        loss_type: claim.loss_types?.name || claim.loss_type || "",
        loss_date: claim.loss_date ? new Date(claim.loss_date).toLocaleDateString() : "",
        loss_description: claim.loss_description || "",
        amount: claim.claim_amount ? `$${claim.claim_amount.toLocaleString()}` : "",
        status: claim.status || "",
      },
      // Policyholder info
      policyholder: claim.policyholder_name || "",
      policyholder_email: claim.policyholder_email || "",
      policyholder_phone: claim.policyholder_phone || "",
      // Address (nested object and full string)
      address: {
        street: street,
        city: city,
        state: state,
        zip: zipCode,
        full: claim.policyholder_address || ""
      },
      // Insurance info
      insurance_company: claim.insurance_companies?.name || claim.insurance_company || "",
      insurance_phone: claim.insurance_phone || "",
      insurance_email: claim.insurance_email || "",
      policy: claim.policy_number || "",
      policy_number: claim.policy_number || "",
      // Adjuster info
      adjuster: {
        name: claim.adjuster_name || "",
        phone: claim.adjuster_phone || "",
        email: claim.adjuster_email || "",
      },
      adjuster_name: claim.adjuster_name || "",
      adjuster_phone: claim.adjuster_phone || "",
      adjuster_email: claim.adjuster_email || "",
      // Referrer info
      referrer: {
        name: claim.referrers?.name || "",
        company: claim.referrers?.company || "",
      },
      // Mortgage info
      mortgage: {
        company: claim.mortgage_companies?.name || "",
        contact: claim.mortgage_companies?.contact_name || "",
        phone: claim.mortgage_companies?.phone || "",
        email: claim.mortgage_companies?.email || "",
      },
      mortgage_company: claim.mortgage_companies?.name || "",
      loan_number: claim.loan_number || "",
      ssn_last_four: claim.ssn_last_four || "",
      // Current date
      date: new Date().toLocaleDateString(),
      today: new Date().toLocaleDateString(),
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
    
    // Handle docxtemplater-specific errors with better messages
    if (error && typeof error === 'object' && 'properties' in error) {
      const docxError = error as any;
      if (docxError.properties?.errors) {
        const errorDetails = docxError.properties.errors.map((e: any) => ({
          message: e.message,
          field: e.properties?.xtag || e.properties?.context,
          explanation: e.properties?.explanation
        }));
        
        console.info({ error: errorDetails });
        
        return new Response(
          JSON.stringify({ 
            error: "Template format error",
            details: "The Word template has formatting issues. Please ensure merge fields like {{field_name}} are not split by formatting (bold, italic, etc.). Try retyping the merge fields without any formatting.",
            technical: errorDetails
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
    }
    
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
