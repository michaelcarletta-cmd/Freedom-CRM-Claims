import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { instanceUrl, syncSecret } = await req.json();

    if (!instanceUrl || !syncSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing instanceUrl or syncSecret" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Fetching users from external instance: ${instanceUrl}`);

    // Call the external instance's endpoint to get their users
    // The external instance should have a "list-instance-users" function that validates the sync secret
    const externalUrl = `${instanceUrl}/functions/v1/list-instance-users`;
    
    const response = await fetch(externalUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-workspace-sync-secret": syncSecret,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`External instance error: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to fetch users from partner instance: ${response.status}` 
        }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log(`Received ${data.users?.length || 0} users from external instance`);

    return new Response(
      JSON.stringify({ success: true, users: data.users || [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in get-instance-users:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
