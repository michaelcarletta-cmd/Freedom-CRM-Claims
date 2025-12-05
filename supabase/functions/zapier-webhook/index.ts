import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action, data } = body;

    console.log('Zapier webhook received:', { action, dataKeys: Object.keys(data || {}) });

    switch (action) {
      case 'import_photo': {
        // Import photo from Company Cam via Zapier
        const { claim_id, policy_number, photo_url, photo_name, category, description } = data;
        
        // Find claim by ID or policy number
        let claimId = claim_id;
        if (!claimId && policy_number) {
          const { data: claim } = await supabase
            .from('claims')
            .select('id')
            .eq('policy_number', policy_number)
            .single();
          claimId = claim?.id;
        }

        if (!claimId) {
          return new Response(JSON.stringify({ error: 'Claim not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Download photo from URL
        const photoResponse = await fetch(photo_url);
        if (!photoResponse.ok) {
          throw new Error(`Failed to fetch photo: ${photoResponse.status}`);
        }
        
        const photoBlob = await photoResponse.blob();
        const fileName = photo_name || `companycam_${Date.now()}.jpg`;
        const filePath = `${claimId}/${fileName}`;

        // Upload to Supabase storage
        const { error: uploadError } = await supabase.storage
          .from('claim-files')
          .upload(filePath, photoBlob, {
            contentType: photoBlob.type || 'image/jpeg',
            upsert: true,
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw uploadError;
        }

        // Create claim_photos record
        const { data: photo, error: photoError } = await supabase
          .from('claim_photos')
          .insert({
            claim_id: claimId,
            file_name: fileName,
            file_path: filePath,
            file_size: photoBlob.size,
            category: category || 'Company Cam',
            description: description || 'Imported from Company Cam via Zapier',
          })
          .select()
          .single();

        if (photoError) {
          console.error('Photo record error:', photoError);
          throw photoError;
        }

        console.log('Photo imported successfully:', photo.id);

        return new Response(JSON.stringify({ 
          success: true, 
          photo_id: photo.id,
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
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
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
