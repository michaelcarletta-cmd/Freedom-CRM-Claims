import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Claim {
  id: string;
  claim_number: string;
  status: string;
  policyholder_name: string;
  policyholder_phone: string;
  policyholder_address: string;
  loss_date: string;
  loss_type: string;
  loss_description: string;
  created_at: string;
}

interface ClaimUpdate {
  id: string;
  content: string;
  update_type: string;
  created_at: string;
  profiles: {
    full_name: string;
  };
}

export default function ContractorPortal() {
  const { user, signOut } = useAuth();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [updates, setUpdates] = useState<Record<string, ClaimUpdate[]>>({});
  const [newUpdate, setNewUpdate] = useState("");
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchAssignedClaims();
    }
  }, [user]);

  const fetchAssignedClaims = async () => {
    try {
      // Get claim IDs assigned to this contractor
      const { data: assignments, error: assignError } = await supabase
        .from("claim_contractors")
        .select("claim_id")
        .eq("contractor_id", user?.id);

      if (assignError) throw assignError;

      if (!assignments || assignments.length === 0) {
        setLoading(false);
        return;
      }

      const claimIds = assignments.map(a => a.claim_id);

      // Fetch the actual claims
      const { data, error } = await supabase
        .from("claims")
        .select("*")
        .in("id", claimIds)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setClaims(data || []);
      
      // Fetch updates for each claim
      if (data) {
        for (const claim of data) {
          fetchClaimUpdates(claim.id);
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchClaimUpdates = async (claimId: string) => {
    try {
      const { data, error } = await supabase
        .from("claim_updates")
        .select("*, profiles(full_name)")
        .eq("claim_id", claimId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setUpdates(prev => ({ ...prev, [claimId]: data || [] }));
    } catch (error: any) {
      console.error("Error fetching updates:", error);
    }
  };

  const handleAddUpdate = async () => {
    if (!selectedClaimId || !newUpdate.trim()) return;

    try {
      const { error } = await supabase.from("claim_updates").insert({
        claim_id: selectedClaimId,
        user_id: user?.id,
        content: newUpdate,
        update_type: "note",
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Update added successfully",
      });

      setNewUpdate("");
      fetchClaimUpdates(selectedClaimId);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Contractor Portal</h1>
            <p className="text-muted-foreground">Manage your assigned claims</p>
          </div>
          <Button onClick={signOut} variant="outline">Sign Out</Button>
        </div>

        {claims.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">No claims assigned to you</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {claims.map((claim) => (
              <Card key={claim.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{claim.claim_number}</CardTitle>
                      <CardDescription>{claim.policyholder_name}</CardDescription>
                    </div>
                    <Badge>{claim.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium">Contact Phone</p>
                      <p className="text-sm text-muted-foreground">{claim.policyholder_phone || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Address</p>
                      <p className="text-sm text-muted-foreground">{claim.policyholder_address || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Loss Date</p>
                      <p className="text-sm text-muted-foreground">
                        {claim.loss_date ? format(new Date(claim.loss_date), "MMM dd, yyyy") : "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Loss Type</p>
                      <p className="text-sm text-muted-foreground">{claim.loss_type || "N/A"}</p>
                    </div>
                  </div>

                  {claim.loss_description && (
                    <div>
                      <p className="text-sm font-medium">Work Description</p>
                      <p className="text-sm text-muted-foreground">{claim.loss_description}</p>
                    </div>
                  )}

                  <Separator />

                  <div>
                    <h3 className="font-medium mb-4">Work Updates & Notes</h3>
                    {updates[claim.id]?.length > 0 ? (
                      <div className="space-y-3 mb-4">
                        {updates[claim.id].map((update) => (
                          <div key={update.id} className="bg-muted p-3 rounded-lg">
                            <div className="flex justify-between items-start mb-1">
                              <p className="text-sm font-medium">{update.profiles?.full_name || "Unknown"}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(update.created_at), "MMM dd, yyyy HH:mm")}
                              </p>
                            </div>
                            <p className="text-sm">{update.content}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mb-4">No updates yet</p>
                    )}

                    <div className="space-y-2">
                      <Textarea
                        placeholder="Add a work update..."
                        value={selectedClaimId === claim.id ? newUpdate : ""}
                        onChange={(e) => {
                          setSelectedClaimId(claim.id);
                          setNewUpdate(e.target.value);
                        }}
                      />
                      <Button
                        onClick={handleAddUpdate}
                        disabled={!newUpdate.trim() || selectedClaimId !== claim.id}
                      >
                        Add Update
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
