import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[GENERATE-INVOICE] ${step}${detailsStr}`);
};

function generateInvoiceHtml(data: any): string {
  const { invoiceNumber, invoiceDate, dueDate, sender, recipient, lineItems, subtotal, notes, claimNumber, policyholderName, workDescription } = data;

  const itemsHtml = lineItems.map((item: any) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.description}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${item.unitPrice.toFixed(2)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${(item.quantity * item.unitPrice).toFixed(2)}</td>
    </tr>
  `).join('');

  // Use contractor name if provided, otherwise fall back to generic
  const companyName = sender?.name || 'Contractor Services';
  const companyEmail = sender?.email || '';
  const companyPhone = sender?.phone || '';
  const companyLogo = sender?.logoUrl || '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoiceNumber}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 40px; color: #1f2937; }
    .invoice-header { display: flex; justify-content: space-between; margin-bottom: 40px; align-items: flex-start; }
    .company-info { display: flex; flex-direction: column; gap: 8px; }
    .company-logo { max-height: 80px; max-width: 200px; margin-bottom: 12px; object-fit: contain; }
    .company-name { font-size: 28px; font-weight: bold; color: #1f2937; margin-bottom: 8px; }
    .company-info p { margin: 4px 0; color: #6b7280; }
    .invoice-details { text-align: right; }
    .invoice-details h2 { margin: 0 0 12px 0; font-size: 32px; color: #111827; }
    .invoice-details p { margin: 4px 0; color: #6b7280; }
    .invoice-details strong { color: #111827; }
    .recipient-section { margin-bottom: 30px; padding: 20px; background: #f9fafb; border-radius: 8px; }
    .recipient-section h3 { margin: 0 0 12px 0; color: #374151; font-size: 14px; text-transform: uppercase; }
    .recipient-section p { margin: 4px 0; color: #1f2937; }
    .property-section { margin-bottom: 30px; padding: 15px 20px; background: #eff6ff; border-radius: 8px; border-left: 4px solid #3b82f6; }
    .property-section h3 { margin: 0 0 8px 0; color: #1e40af; font-size: 14px; text-transform: uppercase; }
    .property-section p { margin: 4px 0; color: #1e3a8a; }
    table { width: 100%; border-collapse: collapse; margin: 30px 0; }
    th { background: #1f2937; color: white; padding: 14px 12px; text-align: left; font-weight: 600; }
    th:nth-child(2), th:nth-child(3), th:nth-child(4) { text-align: center; }
    th:last-child { text-align: right; }
    .totals { margin-left: auto; width: 300px; margin-top: 20px; }
    .totals .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .totals .row.total { border-top: 2px solid #1f2937; border-bottom: none; font-size: 20px; font-weight: bold; padding-top: 16px; }
    .notes { margin-top: 40px; padding: 20px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b; }
    .notes h4 { margin: 0 0 8px 0; color: #92400e; }
    .notes p { margin: 0; color: #78350f; }
    .footer { margin-top: 60px; text-align: center; color: #9ca3af; font-size: 12px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
    .claim-badge { display: inline-block; background: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 20px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="invoice-header">
    <div class="company-info">
      ${companyLogo ? `<img src="${companyLogo}" alt="${companyName} Logo" class="company-logo" />` : ''}
      <div class="company-name">${companyName}</div>
      ${companyPhone ? `<p>Phone: ${companyPhone}</p>` : ''}
      ${companyEmail ? `<p>Email: ${companyEmail}</p>` : ''}
      ${claimNumber ? `<span class="claim-badge">Claim #${claimNumber}</span>` : ''}
    </div>
    <div class="invoice-details">
      <h2>INVOICE</h2>
      <p><strong>Invoice #:</strong> ${invoiceNumber}</p>
      <p><strong>Date:</strong> ${new Date(invoiceDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      <p><strong>Due Date:</strong> ${new Date(dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>
  </div>

  <div class="recipient-section">
    <h3>Bill To</h3>
    <p><strong>${recipient.name}</strong></p>
    ${recipient.email ? `<p>${recipient.email}</p>` : ''}
    ${recipient.address ? `<p>${recipient.address.replace(/\n/g, '<br>')}</p>` : ''}
  </div>

  ${policyholderName ? `
  <div class="property-section">
    <h3>Property Owner / Insured</h3>
    <p><strong>${policyholderName}</strong></p>
  </div>
  ` : ''}

  ${workDescription ? `
  <div style="margin-bottom: 30px; padding: 20px; background: #f0fdf4; border-radius: 8px; border-left: 4px solid #22c55e;">
    <h3 style="margin: 0 0 12px 0; color: #166534; font-size: 14px; text-transform: uppercase;">Work Completed</h3>
    <p style="margin: 0; color: #15803d; line-height: 1.6;">${workDescription}</p>
  </div>
  ` : ''}

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Qty</th>
        <th>Unit Price</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <div class="totals">
    <div class="row">
      <span>Subtotal</span>
      <span>$${subtotal.toFixed(2)}</span>
    </div>
    <div class="row total">
      <span>Total Due</span>
      <span>$${subtotal.toFixed(2)}</span>
    </div>
  </div>

  ${notes ? `
  <div class="notes">
    <h4>Notes</h4>
    <p>${notes}</p>
  </div>
  ` : ''}

  <div class="footer">
    <p>Thank you for your business!</p>
    ${companyEmail ? `<p>Questions? Contact us at ${companyEmail}</p>` : ''}
  </div>
</body>
</html>
  `;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data = await req.json();
    logStep("Received invoice data", { 
      invoiceNumber: data.invoiceNumber, 
      sender: data.sender?.name,
      recipient: data.recipient?.name 
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate HTML invoice
    const invoiceHtml = generateInvoiceHtml(data);
    logStep("Generated invoice HTML");

    // Create PDF-like content by saving HTML to storage
    const fileName = `invoices/${data.invoiceNumber}-${Date.now()}.html`;
    const encoder = new TextEncoder();
    const htmlBuffer = encoder.encode(invoiceHtml);

    const { error: uploadError } = await supabase.storage
      .from("document-templates")
      .upload(fileName, htmlBuffer, {
        contentType: "text/html",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to save invoice: ${uploadError.message}`);
    }

    // Get signed URL for download
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from("document-templates")
      .createSignedUrl(fileName, 7 * 24 * 60 * 60); // 7 days

    if (urlError) {
      throw new Error(`Failed to get invoice URL: ${urlError.message}`);
    }

    logStep("Invoice saved successfully", { fileName });

    return new Response(JSON.stringify({ 
      success: true, 
      pdfUrl: signedUrlData.signedUrl,
      fileName 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
