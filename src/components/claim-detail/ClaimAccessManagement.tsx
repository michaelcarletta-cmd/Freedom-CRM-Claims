import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, X, Users, Building2, UserCheck } from "lucide-react";

interface ClaimAccessManagementProps {
  claimId: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
}

interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export function ClaimAccessManagement({ claimId }: ClaimAccessManagementProps) {
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [contractors, setContractors] = useState<Profile[]>([]);
  const [referrers, setReferrers] = useState<any[]>([]);
  const [assignedContractors, setAssignedContractors] = useState<Profile[]>([]);
  const [currentClientId, setCurrentClientId] = useState<string | null>(null);
  const [currentReferrerId, setCurrentReferrerId] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [selectedContractor, setSelectedContractor] = useState<string>("");
  const [selectedReferrer, setSelectedReferrer] = useState<string>("");
  const { toast } = useToast();

  useEffect(() => {
    fetchClients();
    fetchContractors();
    fetchReferrers();
    fetchClaimAssignments();
  }, [claimId]);

  const fetchClients = async () => {
    try {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .order("name");
      setAllClients(data || []);
    } catch (error: any) {
      console.error("Error fetching clients:", error);
    }
  };

  const fetchContractors = async () => {
    try {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "contractor");

      if (!roles) return;

      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", roles.map(r => r.user_id));

      setContractors(profiles || []);
    } catch (error: any) {
      console.error("Error fetching contractors:", error);
    }
  };

  const fetchReferrers = async () => {
    try {
      const { data } = await supabase
        .from("referrers")
        .select("*")
        .eq("is_active", true);
      setReferrers(data || []);
    } catch (error: any) {
      console.error("Error fetching referrers:", error);
    }
  };

  const fetchClaimAssignments = async () => {
    try {
      // Get current claim data
      const { data: claim } = await supabase
        .from("claims")
        .select("client_id, referrer_id")
        .eq("id", claimId)
        .single();

      if (claim) {
        setCurrentClientId(claim.client_id);
        setCurrentReferrerId(claim.referrer_id);
      }

      // Get assigned contractors
      const { data: assignments } = await supabase
        .from("claim_contractors")
        .select("contractor_id")
        .eq("claim_id", claimId);

      if (assignments) {
        const contractorIds = assignments.map(a => a.contractor_id);
        const { data: contractorProfiles } = await supabase
          .from("profiles")
          .select("*")
          .in("id", contractorIds);
        
        setAssignedContractors(contractorProfiles || []);
      }
    } catch (error: any) {
      console.error("Error fetching assignments:", error);
    }
  };

  const assignClient = async () => {
    if (!selectedClient) return;

    try {
      const { error } = await supabase
        .from("claims")
        .update({ client_id: selectedClient })
        .eq("id", claimId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Client assigned to claim",
      });

      setCurrentClientId(selectedClient);
      setSelectedClient("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const removeClient = async () => {
    try {
      const { error } = await supabase
        .from("claims")
        .update({ client_id: null })
        .eq("id", claimId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Client removed from claim",
      });

      setCurrentClientId(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const assignContractor = async () => {
    if (!selectedContractor) return;

    try {
      const { error } = await supabase
        .from("claim_contractors")
        .insert({
          claim_id: claimId,
          contractor_id: selectedContractor,
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Contractor assigned to claim",
      });

      fetchClaimAssignments();
      setSelectedContractor("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const removeContractor = async (contractorId: string) => {
    try {
      const { error } = await supabase
        .from("claim_contractors")
        .delete()
        .eq("claim_id", claimId)
        .eq("contractor_id", contractorId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Contractor removed from claim",
      });

      fetchClaimAssignments();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const assignReferrer = async () => {
    if (!selectedReferrer) return;

    try {
      const { error } = await supabase
        .from("claims")
        .update({ referrer_id: selectedReferrer })
        .eq("id", claimId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Referrer assigned to claim",
      });

      setCurrentReferrerId(selectedReferrer);
      setSelectedReferrer("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const removeReferrer = async () => {
    try {
      const { error } = await supabase
        .from("claims")
        .update({ referrer_id: null })
        .eq("id", claimId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Referrer removed from claim",
      });

      setCurrentReferrerId(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const currentClient = allClients.find(c => c.id === currentClientId);
  const currentReferrer = referrers.find(r => r.id === currentReferrerId);

  return (
    <div className="space-y-6">
      {/* Client Assignment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Client Access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentClient ? (
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <p className="font-medium">{currentClient.name}</p>
                <p className="text-sm text-muted-foreground">{currentClient.email}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={removeClient}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {allClients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={assignClient} disabled={!selectedClient}>
                <UserPlus className="h-4 w-4 mr-2" />
                Assign
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contractor Assignments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Contractor Access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Select value={selectedContractor} onValueChange={setSelectedContractor}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select contractor" />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {contractors
                  .filter(c => !assignedContractors.some(ac => ac.id === c.id))
                  .map((contractor) => (
                    <SelectItem key={contractor.id} value={contractor.id}>
                      {contractor.full_name || contractor.email}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button onClick={assignContractor} disabled={!selectedContractor}>
              <UserPlus className="h-4 w-4 mr-2" />
              Assign
            </Button>
          </div>

          {assignedContractors.length > 0 && (
            <div className="space-y-2">
              {assignedContractors.map((contractor) => (
                <div key={contractor.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">{contractor.full_name || contractor.email}</p>
                    <p className="text-sm text-muted-foreground">{contractor.email}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeContractor(contractor.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Referrer Assignment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Referrer Access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentReferrer ? (
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <p className="font-medium">{currentReferrer.name}</p>
                <p className="text-sm text-muted-foreground">{currentReferrer.company || currentReferrer.email}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={removeReferrer}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Select value={selectedReferrer} onValueChange={setSelectedReferrer}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select referrer" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {referrers.map((referrer) => (
                    <SelectItem key={referrer.id} value={referrer.id}>
                      {referrer.name} {referrer.company ? `(${referrer.company})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={assignReferrer} disabled={!selectedReferrer}>
                <UserPlus className="h-4 w-4 mr-2" />
                Assign
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
