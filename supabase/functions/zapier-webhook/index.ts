import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

// Parse multipart form data to extract JSON
function parseMultipartFormData(body: string): Record<string, any> | null {
  try {
    // Look for JSON content in the multipart data - more robust regex
    // Pattern: after "name="data"" and Content-Type line, capture JSON object
    const jsonMatch = body.match(/name="data"[\s\S]*?Content-Type:[^\n]*\n\n([\s\S]*?)\n---/);
    if (jsonMatch && jsonMatch[1]) {
      const jsonStr = jsonMatch[1].trim();
      console.log('Extracted JSON from multipart:', jsonStr);
      return JSON.parse(jsonStr);
    }
    
    // Alternative: simpler pattern
    const simpleMatch = body.match(/\{[^{}]*"action"[^{}]*\}/);
    if (simpleMatch) {
      console.log('Extracted JSON via simple match:', simpleMatch[0]);
      return JSON.parse(simpleMatch[0]);
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
        const policy_number = data.policy_number || body.policy_number || data.project_name || body.project_name;
        
        // Company Cam URLs - IMPORTANT: 'uri' is the direct image URL, 'public_url' is just a webpage
        // Priority order: uri (direct image) > other direct URLs > public_url (last resort)
        const directImageUrl = data.uri || body.uri || data.image_url || body.image_url || 
                               data.original_url || body.original_url || data.download_url || body.download_url;
        const fallbackUrl = data.photo_url || body.photo_url || data.public_url || body.public_url;
        
        let photo_url = directImageUrl || fallbackUrl;
        const photo_name = data.photo_name || body.photo_name || data.project_name || body.project_name;
        const category = data.category || body.category || data.photo_label || body.photo_label;
        const description = data.description || body.description;
        const photo_id_external = data.photo_id || body.photo_id;
        
        // Check if this is a Company Cam timeline/webpage URL (not a direct image)
        const isCompanyCamWebpage = photo_url && (photo_url.includes('/timeline/') || photo_url.includes('app.companycam.com'));
        
        console.log('Processing import_photo:', { 
          claim_id, 
          policy_number, 
          photo_url: photo_url?.substring(0, 80),
          hasDirectUrl: !!directImageUrl,
          isCompanyCamWebpage,
          photo_name, 
          category,
          all_fields: Object.keys(data)
        });
        
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

        const fileName = photo_name ? `${photo_name}_${Date.now()}.jpg` : `companycam_${Date.now()}.jpg`;
        const filePath = `${claimId}/${fileName}`;
        let uploadedToStorage = false;

        // Only try to download if it's a direct image URL (not a Company Cam webpage)
        if (!isCompanyCamWebpage) {
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
        } else {
          console.log('Company Cam webpage URL detected - storing as external reference');
        }

        // Create claim_photos record
        const { data: photo, error: photoError } = await supabase
          .from('claim_photos')
          .insert({
            claim_id: claimId,
            file_name: fileName,
            file_path: uploadedToStorage ? filePath : photo_url, // Store path or external URL
            file_size: 0,
            category: category || 'Company Cam',
            description: isCompanyCamWebpage 
              ? `Company Cam photo (external link) - ${description || photo_id_external || ''}`
              : (description || `Imported from Company Cam via Zapier`),
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
          message: uploadedToStorage 
            ? 'Photo imported and stored successfully' 
            : 'Photo reference saved (Company Cam link stored)'
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
