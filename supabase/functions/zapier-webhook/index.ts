import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-signature',
};

// Verify HMAC-SHA256 signature
async function verifyWebhookSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(payload)
    );
    
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expectedSignature.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < signature.length; i++) {
      result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }
    
    return result === 0;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const webhookSecret = Deno.env.get('ZAPIER_WEBHOOK_SECRET');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get raw body text first for signature verification
    const rawBody = await req.text();
    console.log('Zapier webhook raw body length:', rawBody.length);
    
    // Handle empty requests (like health checks)
    if (!rawBody || rawBody.trim() === '') {
      return new Response(JSON.stringify({ status: 'ok', message: 'Webhook endpoint ready' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      const signature = req.headers.get('x-webhook-signature');
      
      if (!signature) {
        console.error('Missing webhook signature');
        return new Response(JSON.stringify({ error: 'Missing webhook signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const isValid = await verifyWebhookSignature(rawBody, signature, webhookSecret);
      
      if (!isValid) {
        console.error('Invalid webhook signature');
        return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      console.log('Webhook signature verified successfully');
    } else {
      console.warn('ZAPIER_WEBHOOK_SECRET not configured - webhook authentication disabled');
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Raw body preview:', rawBody.substring(0, 200));
      return new Response(JSON.stringify({ error: 'Invalid JSON', received: rawBody.substring(0, 100) }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const action = body.action;
    const data = body.data || body;

    console.log('Zapier webhook parsed action:', action);

    switch (action) {
      case 'import_photo': {
        // Import photo from any source via Zapier
        const claim_id = data.claim_id || body.claim_id;
        const policy_number = data.policy_number || body.policy_number;
        const photo_url = data.photo_url || body.photo_url || data.image_url || body.image_url;
        const photo_name = data.photo_name || body.photo_name || `photo_${Date.now()}`;
        const category = data.category || body.category || 'General';
        const description = data.description || body.description;
        
        console.log('Processing import_photo:', { claim_id, policy_number, photo_url: photo_url?.substring(0, 80), photo_name, category });
        
        // Find claim by ID or policy number
        let claimId = claim_id;
        if (!claimId && policy_number) {
          const { data: claim, error: claimError } = await supabase
            .from('claims')
            .select('id')
            .eq('policy_number', policy_number)
            .single();
          
          if (claimError) {
            console.log('Claim lookup error:', claimError);
          }
          claimId = claim?.id;
        }

        if (!claimId) {
          console.log('Claim not found for policy_number:', policy_number);
          return new Response(JSON.stringify({ error: 'Claim not found', policy_number }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        console.log('Found claim:', claimId);

        if (!photo_url) {
          return new Response(JSON.stringify({ error: 'No photo URL provided' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const fileName = `${photo_name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.jpg`;
        const filePath = `${claimId}/photos/${fileName}`;
        let uploadedToStorage = false;

        // Try to download and store the photo
        try {
          console.log('Fetching photo from:', photo_url);
          const photoResponse = await fetch(photo_url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; FreedomClaims/1.0)',
            }
          });
          
          if (photoResponse.ok) {
            const contentType = photoResponse.headers.get('content-type') || 'image/jpeg';
            if (contentType.startsWith('image/')) {
              const photoBlob = await photoResponse.blob();
              console.log('Photo downloaded, size:', photoBlob.size, 'type:', contentType);
              
              if (photoBlob.size > 0) {
                const { error: uploadError } = await supabase.storage
                  .from('claim-files')
                  .upload(filePath, photoBlob, {
                    contentType: contentType,
                    upsert: true,
                  });

                if (uploadError) {
                  console.error('Upload error:', uploadError);
                } else {
                  uploadedToStorage = true;
                  console.log('Photo uploaded to storage:', filePath);
                }
              }
            }
          }
        } catch (fetchError) {
          console.error('Error fetching photo:', fetchError);
        }

        // Create claim_photos record
        const { data: photo, error: photoError } = await supabase
          .from('claim_photos')
          .insert({
            claim_id: claimId,
            file_name: fileName,
            file_path: uploadedToStorage ? filePath : photo_url,
            file_size: 0,
            category: category,
            description: description || 'Imported via Zapier',
          })
          .select()
          .single();

        if (photoError) {
          console.error('Photo record error:', photoError);
          throw photoError;
        }

        console.log('Photo record created:', photo.id, uploadedToStorage ? '(uploaded)' : '(external link)');

        return new Response(JSON.stringify({ 
          success: true, 
          photo_id: photo.id,
          claim_id: claimId,
          stored_locally: uploadedToStorage,
          message: uploadedToStorage ? 'Photo imported successfully' : 'Photo reference saved'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'export_claim': {
        // Export claim data for external use
        const { claim_id } = data;
        
        const { data: claim, error: claimError } = await supabase
          .from('claims')
          .select(`
            *,
            clients(*),
            insurance_companies(*),
            loss_types(*)
          `)
          .eq('id', claim_id)
          .single();

        if (claimError || !claim) {
          return new Response(JSON.stringify({ error: 'Claim not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const exportData = {
          name: `${claim.policyholder_name || 'Unknown'} - ${claim.claim_number || claim.policy_number || 'No Number'}`,
          address: claim.policyholder_address || '',
          notes: `Policy: ${claim.policy_number || 'N/A'}\nClaim: ${claim.claim_number || 'N/A'}\nLoss Type: ${claim.loss_types?.name || claim.loss_type || 'N/A'}\nInsurance: ${claim.insurance_companies?.name || claim.insurance_company || 'N/A'}`,
          claim_id: claim.id,
          policy_number: claim.policy_number,
        };

        return new Response(JSON.stringify({ success: true, data: exportData }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'list_claims': {
        // List recent claims for Zapier dropdown
        const { data: claims, error } = await supabase
          .from('claims')
          .select('id, claim_number, policy_number, policyholder_name')
          .eq('is_closed', false)
          .order('updated_at', { ascending: false })
          .limit(100);

        if (error) throw error;

        const formatted = claims?.map(c => ({
          id: c.id,
          label: `${c.policyholder_name || 'Unknown'} - ${c.claim_number || c.policy_number || c.id.slice(0, 8)}`,
        })) || [];

        return new Response(JSON.stringify(formatted), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action', received_action: action }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    console.error('Zapier webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
