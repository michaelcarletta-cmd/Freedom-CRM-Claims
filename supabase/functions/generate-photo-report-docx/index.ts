import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Download image and convert to base64
async function downloadImageAsBase64(url: string): Promise<{ base64: string; contentType: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to download image: ${response.status}`);
      return null;
    }
    
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Convert to base64
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);
    
    return { base64, contentType };
  } catch (error) {
    console.error("Error downloading image:", error);
    return null;
  }
}

// Get image extension from content type
function getImageExtension(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("webp")) return "webp";
  return "jpeg";
}

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

    // Download all photos for embedding
    console.log(`Downloading ${photoUrls?.length || 0} photos for embedding...`);
    const downloadedImages: { base64: string; extension: string; photoNumber: number; fileName: string; category: string; description: string }[] = [];
    
    if (photoUrls && photoUrls.length > 0) {
      for (const photo of photoUrls) {
        if (photo.url) {
          const imageData = await downloadImageAsBase64(photo.url);
          if (imageData) {
            downloadedImages.push({
              base64: imageData.base64,
              extension: getImageExtension(imageData.contentType),
              photoNumber: photo.photoNumber || downloadedImages.length + 1,
              fileName: photo.fileName || `Photo ${photo.photoNumber}`,
              category: photo.category || "General",
              description: photo.description || "",
            });
            console.log(`Downloaded photo ${photo.photoNumber}: ${photo.fileName}`);
          }
        }
      }
    }
    console.log(`Successfully downloaded ${downloadedImages.length} images`);

    // Use PizZip to create the Word document
    const PizZip = (await import("https://esm.sh/pizzip@3.1.4")).default;

    // Format the report date
    const reportDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // Build weather summary if available
    let weatherSummary = "";
    if (weatherData && weatherData.daily) {
      const idx = weatherData.dayIndex >= 0 ? weatherData.dayIndex : 1;
      weatherSummary = `Weather on ${weatherData.lossDate}: ${weatherData.daily.weatherDescription?.[idx] || 'N/A'}, ` +
        `High ${weatherData.daily.maxTemp?.[idx]}°F, Wind ${weatherData.daily.maxWindSpeed?.[idx]} mph`;
    }

    // Create DOCX with embedded images
    const zip = new PizZip();
    
    // Build content types with image types
    const imageExtensions = [...new Set(downloadedImages.map(img => img.extension))];
    const contentTypesExtensions = imageExtensions.map(ext => {
      const mimeType = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/jpeg";
      return `<Default Extension="${ext}" ContentType="${mimeType}"/>`;
    }).join("\n  ");

    // [Content_Types].xml
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${contentTypesExtensions}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);
    
    // _rels/.rels
    zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
    
    // Build image relationships
    const imageRelationships = downloadedImages.map((img, idx) => 
      `<Relationship Id="rId${idx + 10}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${idx + 1}.${img.extension}"/>`
    ).join("\n  ");
    
    // word/_rels/document.xml.rels
    zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  ${imageRelationships}
</Relationships>`);

    // Add images to word/media/
    for (let i = 0; i < downloadedImages.length; i++) {
      const img = downloadedImages[i];
      // Decode base64 to binary
      const binaryString = atob(img.base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let j = 0; j < binaryString.length; j++) {
        bytes[j] = binaryString.charCodeAt(j);
      }
      zip.file(`word/media/image${i + 1}.${img.extension}`, bytes);
    }
    
    // word/styles.xml
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
  <w:style w:type="paragraph" w:styleId="PhotoCaption">
    <w:name w:val="Photo Caption"/>
    <w:pPr><w:spacing w:before="100" w:after="300"/><w:jc w:val="center"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:i/><w:sz w:val="20"/><w:color w:val="666666"/></w:rPr>
  </w:style>
</w:styles>`);

    // Escape XML special characters in content
    const escapeXml = (str: string) => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    // Convert content to paragraphs with proper XML escaping
    const contentParagraphs = reportContent.split('\n').map((line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return '<w:p/>';
      
      // Check if it's a heading
      if (trimmed.match(/^[A-Z][A-Z\s&]+:?$/) || trimmed.match(/^(SECTION|PART|CHAPTER)\s/i)) {
        return `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${escapeXml(trimmed)}</w:t></w:r></w:p>`;
      }
      if (trimmed.match(/^\d+\.\s+[A-Z]/) || trimmed.match(/^Photo\s+\d+/i)) {
        return `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>${escapeXml(trimmed)}</w:t></w:r></w:p>`;
      }
      
      return `<w:p><w:r><w:t>${escapeXml(trimmed)}</w:t></w:r></w:p>`;
    }).join('\n    ');

    // Build photo gallery section with embedded images
    // Image dimensions: width = 5 inches = 4572000 EMUs, height proportional (assuming 4:3 aspect)
    const imageWidth = 4572000; // 5 inches in EMUs
    const imageHeight = 3429000; // ~3.75 inches in EMUs (4:3 aspect ratio)
    
    const photoGalleryXml = downloadedImages.map((img, idx) => {
      return `
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Photo ${img.photoNumber}: ${escapeXml(img.fileName)}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:i/></w:rPr><w:t>Category: ${escapeXml(img.category)}${img.description ? ' | ' + escapeXml(img.description) : ''}</w:t></w:r></w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r>
        <w:drawing>
          <wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
            <wp:extent cx="${imageWidth}" cy="${imageHeight}"/>
            <wp:docPr id="${idx + 1}" name="Photo ${img.photoNumber}"/>
            <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:nvPicPr>
                    <pic:cNvPr id="${idx + 1}" name="image${idx + 1}.${img.extension}"/>
                    <pic:cNvPicPr/>
                  </pic:nvPicPr>
                  <pic:blipFill>
                    <a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId${idx + 10}"/>
                    <a:stretch><a:fillRect/></a:stretch>
                  </pic:blipFill>
                  <pic:spPr>
                    <a:xfrm>
                      <a:off x="0" y="0"/>
                      <a:ext cx="${imageWidth}" cy="${imageHeight}"/>
                    </a:xfrm>
                    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
    <w:p/>`;
    }).join('\n');
    
    // word/document.xml - Main content with embedded images
    zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${escapeXml(reportTitle || "Photo Analysis Report")}</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/><w:color w:val="666666"/></w:rPr><w:t>${escapeXml(companyBranding?.company_name || "Freedom Adjustment")}</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/><w:color w:val="666666"/></w:rPr><w:t>${escapeXml(reportDate)}</w:t></w:r></w:p>
    <w:p/>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Claim Information</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Claim Number: </w:t></w:r><w:r><w:t>${escapeXml(claimData?.claim_number || "")}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Policyholder: </w:t></w:r><w:r><w:t>${escapeXml(claimData?.policyholder_name || "")}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Property Address: </w:t></w:r><w:r><w:t>${escapeXml(claimData?.policyholder_address || "")}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Loss Date: </w:t></w:r><w:r><w:t>${escapeXml(claimData?.loss_date ? new Date(claimData.loss_date).toLocaleDateString() : "")}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Insurance Company: </w:t></w:r><w:r><w:t>${escapeXml(claimData?.insurance_company || "")}</w:t></w:r></w:p>
    ${weatherSummary ? `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Weather Conditions: </w:t></w:r><w:r><w:t>${escapeXml(weatherSummary)}</w:t></w:r></w:p>` : ''}
    <w:p/>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Analysis Report</w:t></w:r></w:p>
    ${contentParagraphs}
    <w:p/>
    ${downloadedImages.length > 0 ? `
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Photo Documentation</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:i/><w:color w:val="666666"/></w:rPr><w:t>The following ${downloadedImages.length} photos are referenced in this report:</w:t></w:r></w:p>
    ${photoGalleryXml}
    ` : ''}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`);

    // Generate the output
    const outputBuffer = zip.generate({
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

    console.log(`Report generated with ${downloadedImages.length} embedded photos`);

    return new Response(
      JSON.stringify({ 
        success: true,
        downloadUrl: signedUrlData?.signedUrl,
        fileName: `AI Photo Report - ${new Date().toLocaleDateString()}.docx`,
        photosEmbedded: downloadedImages.length,
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
