import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { reportContent, claimId, reportTitle, reportType, photoUrls, weatherData, companyBranding } = await req.json();

    if (!reportContent) {
      return new Response(
        JSON.stringify({ error: "No report content provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch claim data for additional context
    let claimData: any = null;
    if (claimId) {
      const { data: claim } = await supabase
        .from("claims")
        .select("*")
        .eq("id", claimId)
        .single();
      claimData = claim;
    }

    // Use docxtemplater to create a Word document
    const PizZip = (await import("https://esm.sh/pizzip@3.1.4")).default;
    const Docxtemplater = (await import("https://esm.sh/docxtemplater@3.42.0")).default;

    // Create a minimal DOCX template structure
    // This creates a basic Word document with content
    const templateContent = await createBasicDocxTemplate();
    
    const zip = new PizZip(templateContent);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => "",
    });

    // Format the report date
    const reportDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // Build photo list section
    let photoListHtml = "";
    if (photoUrls && photoUrls.length > 0) {
      photoListHtml = photoUrls.map((p: any, i: number) => 
        `Photo ${p.photoNumber || i + 1}: ${p.fileName} (${p.category})`
      ).join("\n");
    }

    // Build weather summary if available
    let weatherSummary = "";
    if (weatherData && weatherData.daily) {
      const idx = weatherData.dayIndex >= 0 ? weatherData.dayIndex : 1;
      weatherSummary = `Weather on ${weatherData.lossDate}: ${weatherData.daily.weatherDescription?.[idx] || 'N/A'}, ` +
        `High ${weatherData.daily.maxTemp?.[idx]}°F, Wind ${weatherData.daily.maxWindSpeed?.[idx]} mph`;
    }

    // Prepare template data
    const templateData = {
      title: reportTitle || "Photo Analysis Report",
      date: reportDate,
      claim_number: claimData?.claim_number || "",
      policyholder: claimData?.policyholder_name || "",
      address: claimData?.policyholder_address || "",
      loss_date: claimData?.loss_date ? new Date(claimData.loss_date).toLocaleDateString() : "",
      loss_type: claimData?.loss_type || "",
      insurance_company: claimData?.insurance_company || "",
      report_type: reportType || "Photo Analysis",
      content: reportContent,
      photo_list: photoListHtml,
      weather_summary: weatherSummary,
      company_name: companyBranding?.company_name || "Freedom Adjustment",
    };

    doc.render(templateData);

    // Generate the output
    const outputBuffer = doc.getZip().generate({
      type: "uint8array",
      compression: "DEFLATE",
    });

    // Save to storage
    const fileName = `${claimId}/reports/ai_photo_report_${Date.now()}.docx`;
    const { error: uploadError } = await supabase.storage
      .from("claim-files")
      .upload(fileName, outputBuffer, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error("Failed to save report to storage");
    }

    // Create claim file record
    await supabase.from("claim_files").insert({
      claim_id: claimId,
      file_name: `AI Photo Report - ${new Date().toLocaleDateString()}.docx`,
      file_path: fileName,
      file_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      file_size: outputBuffer.length,
    });

    // Get signed URL for download
    const { data: signedUrlData } = await supabase.storage
      .from("claim-files")
      .createSignedUrl(fileName, 3600);

    return new Response(
      JSON.stringify({ 
        success: true,
        downloadUrl: signedUrlData?.signedUrl,
        fileName: `AI Photo Report - ${new Date().toLocaleDateString()}.docx`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error generating Word document:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Create a basic DOCX template structure
async function createBasicDocxTemplate(): Promise<Uint8Array> {
  const PizZip = (await import("https://esm.sh/pizzip@3.1.4")).default;
  
  // This creates a minimal valid DOCX structure
  const zip = new PizZip();
  
  // [Content_Types].xml
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);
  
  // _rels/.rels
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  
  // word/_rels/document.xml.rels
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  
  // word/styles.xml - Define styles for headings
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:pPr><w:spacing w:after="300"/><w:jc w:val="center"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="48"/><w:color w:val="1E3A5F"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="Heading 1"/>
    <w:pPr><w:spacing w:before="400" w:after="200"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="32"/><w:color w:val="1E3A5F"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="Heading 2"/>
    <w:pPr><w:spacing w:before="300" w:after="150"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="28"/><w:color w:val="374151"/></w:rPr>
  </w:style>
</w:styles>`);
  
  // word/document.xml - Main content with template variables
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>{title}</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/><w:color w:val="666666"/></w:rPr><w:t>{company_name}</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/><w:color w:val="666666"/></w:rPr><w:t>{date}</w:t></w:r></w:p>
    <w:p/>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Claim Information</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Claim Number: </w:t></w:r><w:r><w:t>{claim_number}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Policyholder: </w:t></w:r><w:r><w:t>{policyholder}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Property Address: </w:t></w:r><w:r><w:t>{address}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Loss Date: </w:t></w:r><w:r><w:t>{loss_date}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Insurance Company: </w:t></w:r><w:r><w:t>{insurance_company}</w:t></w:r></w:p>
    <w:p/>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Analysis Report</w:t></w:r></w:p>
    <w:p><w:r><w:t>{content}</w:t></w:r></w:p>
    <w:p/>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Photo References</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:i/><w:color w:val="666666"/></w:rPr><w:t>Photos referenced in this report are available in the claim file. Insert photos below as needed:</w:t></w:r></w:p>
    <w:p><w:r><w:t>{photo_list}</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`);
  
  return zip.generate({ type: "uint8array" });
}
