import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

// Parse multipart form data to extract JSON
function parseMultipartFormData(body: string): Record<string, any> | null {
  try {
    // Look for JSON content in the multipart data
    const jsonMatch = body.match(/Content-Type: application\/json[^\n]*\n\n({[^}]+})/);
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1]);
    }
    
    // Alternative: look for the data field content
    const dataMatch = body.match(/name="data"[^{]*({[\s\S]*?})\s*---/);
    if (dataMatch && dataMatch[1]) {
      return JSON.parse(dataMatch[1].trim());
    }
    
    return null;
  } catch (e) {
    console.error('Error parsing multipart form data:', e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get raw body text first for logging
    const rawBody = await req.text();
    console.log('Zapier webhook raw body length:', rawBody.length);
    
    // Handle empty requests (like health checks)
    if (!rawBody || rawBody.trim() === '') {
      return new Response(JSON.stringify({ status: 'ok', message: 'Webhook endpoint ready' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body;
    
    // Check if it's multipart form data
    if (rawBody.includes('Content-Disposition: form-data')) {
      console.log('Detected multipart form data');
      body = parseMultipartFormData(rawBody);
      if (!body) {
        console.error('Failed to parse multipart form data');
        return new Response(JSON.stringify({ error: 'Failed to parse multipart form data' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      // Try regular JSON parse
      try {
        body = JSON.parse(rawBody);
      } catch (parseError) {
        console.error('JSON parse error:', parseError, 'Raw body preview:', rawBody.substring(0, 200));
        return new Response(JSON.stringify({ error: 'Invalid JSON', received: rawBody.substring(0, 100) }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Handle both nested (data.field) and flat (field) payload structures from Zapier
    const action = body.action;
    const data = body.data || body;

    console.log('Zapier webhook parsed:', JSON.stringify(body));

    switch (action) {
      case 'import_photo': {
        // Import photo from Company Cam via Zapier
        // Support both nested and flat field names
        const claim_id = data.claim_id || body.claim_id;
        const policy_number = data.policy_number || body.policy_number;
        // Company Cam URLs - try multiple possible field names
        let photo_url = data.photo_url || body.photo_url || data.uri || body.uri || data.public_url || body.public_url;
        const photo_name = data.photo_name || body.photo_name || data.project_name || body.project_name;
        const category = data.category || body.category;
        const description = data.description || body.description;
        
        console.log('Processing import_photo:', { claim_id, policy_number, photo_url, photo_name, category });
        
        // Company Cam timeline URLs need to be converted to actual image URLs
        // Timeline URL: https://app.companycam.com/timeline/B1wecKk8eRkUgaSc
        // We need the actual image URL from Company Cam's API
        // For now, check if this is a timeline URL and log a warning
        if (photo_url && photo_url.includes('/timeline/')) {
          console.log('Warning: Received timeline URL instead of direct image URL');
          // Try to use the photo without downloading (store as external URL reference)
        }
        
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

        // Try to download photo from URL
        let photoBlob: Blob | null = null;
        let contentType = 'image/jpeg';
        
        try {
          console.log('Fetching photo from:', photo_url);
          const photoResponse = await fetch(photo_url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; FreedomClaims/1.0)',
            }
          });
          
          if (!photoResponse.ok) {
            console.log('Photo fetch failed:', photoResponse.status, photoResponse.statusText);
            // If we can't download, store as external reference
          } else {
            contentType = photoResponse.headers.get('content-type') || 'image/jpeg';
            // Check if response is actually an image
            if (contentType.startsWith('image/')) {
              photoBlob = await photoResponse.blob();
              console.log('Photo downloaded, size:', photoBlob.size, 'type:', contentType);
            } else {
              console.log('Response is not an image, content-type:', contentType);
            }
          }
        } catch (fetchError) {
          console.error('Error fetching photo:', fetchError);
        }

        const fileName = photo_name ? `${photo_name}_${Date.now()}.jpg` : `companycam_${Date.now()}.jpg`;
        const filePath = `${claimId}/${fileName}`;

        if (photoBlob && photoBlob.size > 0) {
          // Upload to Supabase storage
          const { error: uploadError } = await supabase.storage
            .from('claim-files')
            .upload(filePath, photoBlob, {
              contentType: contentType,
              upsert: true,
            });

          if (uploadError) {
            console.error('Upload error:', uploadError);
            throw uploadError;
          }
          console.log('Photo uploaded to storage:', filePath);
        }

        // Create claim_photos record
        const { data: photo, error: photoError } = await supabase
          .from('claim_photos')
          .insert({
            claim_id: claimId,
            file_name: fileName,
            file_path: photoBlob && photoBlob.size > 0 ? filePath : photo_url, // Store path or external URL
            file_size: photoBlob?.size || 0,
            category: category || 'Company Cam',
            description: description || `Imported from Company Cam via Zapier`,
          })
          .select()
          .single();

        if (photoError) {
          console.error('Photo record error:', photoError);
          throw photoError;
        }

        console.log('Photo record created:', photo.id);

        return new Response(JSON.stringify({ 
          success: true, 
          photo_id: photo.id,
          claim_id: claimId,
          message: 'Photo imported successfully' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'export_claim': {
        // Export claim data for Company Cam project creation
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

        // Format for Company Cam
        const companyCamData = {
          name: `${claim.policyholder_name || 'Unknown'} - ${claim.claim_number || claim.policy_number || 'No Number'}`,
          address: claim.policyholder_address || '',
          notes: `Policy: ${claim.policy_number || 'N/A'}\nClaim: ${claim.claim_number || 'N/A'}\nLoss Type: ${claim.loss_types?.name || claim.loss_type || 'N/A'}\nInsurance: ${claim.insurance_companies?.name || claim.insurance_company || 'N/A'}`,
          claim_id: claim.id,
          policy_number: claim.policy_number,
        };

        return new Response(JSON.stringify({ success: true, data: companyCamData }), {
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
