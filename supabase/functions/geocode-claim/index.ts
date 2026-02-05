import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { claimId } = await req.json();

    if (!claimId) {
      return new Response(
        JSON.stringify({ error: "claimId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the claim to get the address
    const { data: claim, error: claimError } = await supabase
      .from("claims")
      .select("id, policyholder_address, latitude, longitude")
      .eq("id", claimId)
      .single();

    if (claimError || !claim) {
      return new Response(
        JSON.stringify({ error: "Claim not found", details: claimError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use the full address field directly
    const fullAddress = claim.policyholder_address;

    if (!fullAddress) {
      return new Response(
        JSON.stringify({ success: false, message: "No address available for geocoding" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use OpenStreetMap Nominatim for geocoding (free, no API key required)
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=1`;

    const geoResponse = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "FreedomClaims/1.0",
      },
    });

    if (!geoResponse.ok) {
      return new Response(
        JSON.stringify({ success: false, message: "Geocoding service unavailable" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geoData = await geoResponse.json();

    if (!geoData || geoData.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: "Address could not be geocoded" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { lat, lon } = geoData[0];
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    // Update the claim with coordinates
    const { error: updateError } = await supabase
      .from("claims")
      .update({
        latitude,
        longitude,
        geocoded_at: new Date().toISOString(),
      })
      .eq("id", claimId);

    if (updateError) {
      return new Response(
        JSON.stringify({ success: false, message: "Failed to update claim coordinates", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        latitude,
        longitude,
        address: fullAddress,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Geocode error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
