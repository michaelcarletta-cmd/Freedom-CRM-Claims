import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Maximum photos to include in PDF
const MAX_PHOTOS = 20;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { claimId, reportTitle, photoUrls, companyBranding } = await req.json();

    if (!claimId) {
      return new Response(
        JSON.stringify({ error: "No claim ID provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch claim data
    const { data: claimData } = await supabase
      .from("claims")
      .select("*")
      .eq("id", claimId)
      .single();

    const allPhotos = photoUrls || [];
    const photosToInclude = allPhotos.slice(0, MAX_PHOTOS);
    
    console.log(`Generating PDF photo report with ${photosToInclude.length} photos`);

    const reportDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // Generate HTML for PDF - photos are referenced by URL, not embedded
    const photoRowsHtml = photosToInclude.map((photo: any, idx: number) => `
      <div class="photo-card">
        <div class="photo-header">
          <span class="photo-number">Photo ${photo.photoNumber || idx + 1}</span>
          <span class="photo-category">${escapeHtml(photo.category || 'General')}</span>
        </div>
        <div class="photo-container">
          <img src="${escapeHtml(photo.url)}" alt="Photo ${photo.photoNumber || idx + 1}" />
        </div>
        <div class="photo-details">
          <div class="photo-filename">${escapeHtml(photo.fileName || `Photo ${idx + 1}`)}</div>
          ${photo.description ? `<div class="photo-description">${escapeHtml(photo.description)}</div>` : ''}
        </div>
      </div>
    `).join('');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(reportTitle || 'Photo Report')}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      background: #f5f5f5; 
      color: #333; 
      line-height: 1.6;
    }
    .header { 
      background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); 
      color: white; 
      padding: 40px; 
      text-align: center;
    }
    .header h1 { font-size: 28px; margin-bottom: 10px; }
    .header .company { font-size: 18px; opacity: 0.9; margin-bottom: 5px; }
    .header .date { font-size: 14px; opacity: 0.8; }
    .claim-info {
      background: white;
      padding: 20px 40px;
      border-bottom: 1px solid #ddd;
    }
    .claim-info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
    }
    .claim-info-item { }
    .claim-info-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .claim-info-value { font-size: 16px; font-weight: 600; }
    .photos-container { 
      padding: 30px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 20px;
    }
    .photo-card { 
      background: white; 
      border-radius: 8px; 
      overflow: hidden; 
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      break-inside: avoid;
    }
    .photo-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: #f8f9fa;
      border-bottom: 1px solid #eee;
    }
    .photo-number { font-weight: 600; color: #1e3a5f; }
    .photo-category { 
      font-size: 12px; 
      padding: 4px 10px; 
      background: #e3f2fd; 
      color: #1976d2; 
      border-radius: 12px;
    }
    .photo-container { 
      padding: 16px;
      display: flex;
      justify-content: center;
      background: #fafafa;
    }
    .photo-container img { 
      max-width: 100%; 
      max-height: 400px; 
      object-fit: contain;
      border-radius: 4px;
    }
    .photo-details { padding: 16px; }
    .photo-filename { font-weight: 500; margin-bottom: 4px; }
    .photo-description { font-size: 14px; color: #666; }
    .footer {
      text-align: center;
      padding: 20px;
      color: #666;
      font-size: 12px;
      border-top: 1px solid #ddd;
      background: white;
      margin-top: 20px;
    }
    @media print {
      body { background: white; }
      .photo-card { page-break-inside: avoid; }
      .photos-container { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company">${escapeHtml(companyBranding?.company_name || 'Freedom Adjustment')}</div>
    <h1>${escapeHtml(reportTitle || 'Photo Documentation Report')}</h1>
    <div class="date">${reportDate}</div>
  </div>
  
  <div class="claim-info">
    <div class="claim-info-grid">
      <div class="claim-info-item">
        <div class="claim-info-label">Claim Number</div>
        <div class="claim-info-value">${escapeHtml(claimData?.claim_number || 'N/A')}</div>
      </div>
      <div class="claim-info-item">
        <div class="claim-info-label">Policyholder</div>
        <div class="claim-info-value">${escapeHtml(claimData?.policyholder_name || 'N/A')}</div>
      </div>
      <div class="claim-info-item">
        <div class="claim-info-label">Property Address</div>
        <div class="claim-info-value">${escapeHtml(claimData?.policyholder_address || 'N/A')}</div>
      </div>
      <div class="claim-info-item">
        <div class="claim-info-label">Loss Date</div>
        <div class="claim-info-value">${claimData?.loss_date ? new Date(claimData.loss_date).toLocaleDateString() : 'N/A'}</div>
      </div>
    </div>
  </div>

  <div class="photos-container">
    ${photoRowsHtml}
  </div>

  <div class="footer">
    Generated on ${reportDate} • ${photosToInclude.length} photos included
    ${allPhotos.length > MAX_PHOTOS ? ` • ${allPhotos.length - MAX_PHOTOS} additional photos available in system` : ''}
  </div>
</body>
</html>`;

    // Return HTML for client-side PDF generation (using html2pdf.js)
    return new Response(
      JSON.stringify({ 
        html,
        photoCount: photosToInclude.length,
        totalPhotos: allPhotos.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error generating photo report PDF:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
