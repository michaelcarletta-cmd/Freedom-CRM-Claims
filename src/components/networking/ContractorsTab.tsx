import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

interface Contractor {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
}

export const ContractorsTab = () => {
  const [contractors, setContractors] = useState<Contractor[]>([]);

  useEffect(() => {
    fetchContractors();
  }, []);

  const fetchContractors = async () => {
    // Fetch users with contractor role
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "contractor");

    if (roleError) {
      toast.error("Failed to fetch contractors");
      return;
    }

    if (!roleData || roleData.length === 0) {
      setContractors([]);
      return;
    }

    const contractorIds = roleData.map((r) => r.user_id);

    // Fetch profiles for these users
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .in("id", contractorIds);

    if (profileError) {
      toast.error("Failed to fetch contractor profiles");
      return;
    }

    setContractors(profileData || []);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="space-y-2">
          {contractors.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No contractors found. Contractors are users with the contractor role.
            </p>
          ) : (
            contractors.map((contractor) => (
              <div
                key={contractor.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="font-medium">{contractor.full_name || "No name"}</div>
                  <div className="text-sm text-muted-foreground">Email: {contractor.email}</div>
                  {contractor.phone && (
                    <div className="text-sm text-muted-foreground">Phone: {contractor.phone}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};