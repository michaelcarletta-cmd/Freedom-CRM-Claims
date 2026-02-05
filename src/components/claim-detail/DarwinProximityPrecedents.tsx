import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  MapPin, Loader2, Search, AlertTriangle, 
  CheckCircle2, Building2, Calendar, DollarSign, Zap
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";

interface DarwinProximityPrecedentsProps {
  claimId: string;
  claim: any;
}

export const DarwinProximityPrecedents = ({ claimId, claim }: DarwinProximityPrecedentsProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSearching, setIsSearching] = useState(false);
  const [isBatchGeocoding, setIsBatchGeocoding] = useState(false);
  const [geocodeProgress, setGeocodeProgress] = useState({ current: 0, total: 0 });

  // Fetch proximity precedents when we have coordinates
  // Search ALL carriers - not just the current claim's carrier - to find any precedents
  const { data: precedents, refetch, isLoading } = useQuery({
    queryKey: ["proximity-precedents", claimId, claim?.latitude, claim?.longitude],
    queryFn: async () => {
      if (!claim?.latitude || !claim?.longitude) return null;

      const { data, error } = await supabase.rpc("search_claims_by_proximity", {
        target_lat: claim.latitude,
        target_lng: claim.longitude,
        radius_miles: 5,
        exclude_claim_id: claimId,
        // Don't filter by carrier - we want ALL nearby settled claims as precedents
        target_insurance_company: null,
      });

      if (error) throw error;
      return data;
    },
    enabled: !!claim?.latitude && !!claim?.longitude,
  });

  // Check how many claims in the area need geocoding
  const { data: geocodeStats } = useQuery({
    queryKey: ["geocode-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claims")
        .select("id, policyholder_address", { count: "exact" })
        .is("latitude", null)
        .neq("id", claimId)
        .limit(100);

      if (error) throw error;
      return { ungeocoded: data?.length || 0, total: data?.length || 0 };
    },
  });

  const handleGeocode = async () => {
    setIsSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("geocode-claim", {
        body: { claimId },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Location found",
          description: "Searching for nearby precedents...",
        });
        // Refetch precedents after geocoding
        setTimeout(() => refetch(), 1000);
      } else {
        toast({
          title: "Geocoding issue",
          description: data?.message || "Could not determine claim location",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Geocoding error:", error);
      toast({
        title: "Search failed",
        description: error.message || "Failed to search for nearby claims",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Batch geocode nearby claims to populate proximity data
  const handleBatchGeocode = async () => {
    setIsBatchGeocoding(true);
    try {
      // Get claims that haven't been geocoded yet
      const { data: ungeocoded, error } = await supabase
        .from("claims")
        .select("id, policyholder_address")
        .is("latitude", null)
        .neq("id", claimId)
        .limit(50); // Process 50 at a time

      if (error) throw error;
      if (!ungeocoded || ungeocoded.length === 0) {
        toast({ title: "All claims are geocoded!" });
        return;
      }

      setGeocodeProgress({ current: 0, total: ungeocoded.length });

      let successCount = 0;
      for (let i = 0; i < ungeocoded.length; i++) {
        const claim = ungeocoded[i];
        setGeocodeProgress({ current: i + 1, total: ungeocoded.length });

        try {
          const { data } = await supabase.functions.invoke("geocode-claim", {
            body: { claimId: claim.id },
          });
          if (data?.success) successCount++;
          // Small delay to avoid rate limiting
          await new Promise(r => setTimeout(r, 200));
        } catch (e) {
          console.warn("Failed to geocode:", claim.id);
        }
      }

      toast({
        title: "Batch geocoding complete",
        description: `Successfully geocoded ${successCount} of ${ungeocoded.length} claims`,
      });

      // Refetch everything
      queryClient.invalidateQueries({ queryKey: ["proximity-precedents"] });
      queryClient.invalidateQueries({ queryKey: ["geocode-stats"] });
      refetch();
    } catch (error: any) {
      console.error("Batch geocode error:", error);
      toast({
        title: "Batch geocoding failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsBatchGeocoding(false);
      setGeocodeProgress({ current: 0, total: 0 });
    }
  };

  const hasCoordinates = !!claim?.latitude && !!claim?.longitude;
  const settledPrecedents = precedents?.filter(
    (p: any) => p.is_closed || p.status === "Settled" || p.status === "Closed" || p.status === "Claim Settled" || p.claim_amount > 0
  ) || [];

  return (
    <Card className="border-primary/20">
      <CardHeader className="bg-primary/5 border-b">
        <CardTitle className="flex items-center gap-2 text-foreground">
          <MapPin className="h-5 w-5 text-primary" />
          Proximity Precedents
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Find settled claims within 5 miles to cite as evidence of inconsistent carrier handling
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {!hasCoordinates ? (
          <div className="text-center py-6">
            <MapPin className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              Geocode this claim to search for nearby precedents
            </p>
            <Button onClick={handleGeocode} disabled={isSearching}>
              {isSearching ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Geocoding...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Find Location & Search
                </>
              )}
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
            <span className="text-sm text-muted-foreground">Searching nearby claims...</span>
          </div>
        ) : settledPrecedents.length === 0 ? (
          <div className="text-center py-6 space-y-4">
            <AlertTriangle className="h-10 w-10 mx-auto text-warning mb-3" />
            <div>
              <p className="text-sm font-medium text-foreground mb-1">
                No geocoded claims found within 5 miles
              </p>
              <p className="text-xs text-muted-foreground">
                {geocodeStats?.ungeocoded ? `${geocodeStats.ungeocoded}+ claims need geocoding to enable proximity search` : "Claims need to be geocoded first"}
              </p>
            </div>
            
            {isBatchGeocoding ? (
              <div className="space-y-2 max-w-xs mx-auto">
                <Progress value={(geocodeProgress.current / geocodeProgress.total) * 100} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Geocoding {geocodeProgress.current} of {geocodeProgress.total} claims...
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 items-center">
                <Button onClick={handleBatchGeocode} size="sm">
                  <Zap className="h-4 w-4 mr-2" />
                  Geocode Claims to Find Precedents
                </Button>
                <Button variant="ghost" size="sm" onClick={() => refetch()}>
                  <Search className="h-4 w-4 mr-2" />
                  Search Again
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="bg-primary/10 text-primary">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {settledPrecedents.length} precedent{settledPrecedents.length !== 1 ? "s" : ""} found
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => refetch()}>
                <Search className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>

            <ScrollArea className="h-[300px]">
              <div className="space-y-3 pr-4">
                {settledPrecedents.map((p: any) => (
                  <Card key={p.claim_id} className="border-border/50">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-medium text-sm">{p.policyholder_name}</h4>
                          <p className="text-xs text-muted-foreground">{p.claim_number}</p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {p.distance_miles?.toFixed(1)} mi
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-xs mt-3">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate">{p.policyholder_address}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Building2 className="h-3 w-3" />
                          <span>{p.insurance_company}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>{p.loss_date ? new Date(p.loss_date).toLocaleDateString() : "N/A"}</span>
                        </div>
                        {p.claim_amount > 0 && (
                          <div className="flex items-center gap-1.5 text-primary">
                            <DollarSign className="h-3 w-3" />
                            <span>${p.claim_amount.toLocaleString()}</span>
                          </div>
                        )}
                      </div>

                      {p.settlement_notes && (
                        <div className="mt-3 p-2 bg-muted/50 rounded text-xs">
                          <span className="font-medium">Notes: </span>
                          {p.settlement_notes}
                        </div>
                      )}
                      
                      <div className="mt-3 flex gap-1">
                        <Badge variant="secondary" className="text-xs">
                          {p.loss_type || "Unknown peril"}
                        </Badge>
                        <Badge variant="default" className="text-xs">
                          {p.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>

            <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
              <p className="font-medium mb-1">💡 How to use in rebuttals:</p>
              <p>
                Cite these precedents to show {claim.insurance_company} has approved similar claims 
                in the same area. This demonstrates inconsistent handling if they deny the current claim.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
