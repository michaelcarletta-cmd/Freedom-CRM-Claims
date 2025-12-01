import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Contractor {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
}

export const ContractorsTab = () => {
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    phone: "",
  });

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

  const handleAddContractor = async () => {
    if (!formData.email.trim() || !formData.full_name.trim()) {
      toast.error("Email and name are required");
      return;
    }

    // Create a temporary password for the contractor
    const tempPassword = Math.random().toString(36).slice(-8) + "A1!";

    // Sign up the user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: formData.email,
      password: tempPassword,
      options: {
        data: {
          full_name: formData.full_name,
        },
      },
    });

    if (authError) {
      toast.error("Failed to create contractor: " + authError.message);
      return;
    }

    if (!authData.user) {
      toast.error("Failed to create contractor");
      return;
    }

    // Update profile with phone
    if (formData.phone) {
      await supabase
        .from("profiles")
        .update({ phone: formData.phone })
        .eq("id", authData.user.id);
    }

    // Assign contractor role
    const { error: roleError } = await supabase
      .from("user_roles")
      .insert([{ user_id: authData.user.id, role: "contractor" }]);

    if (roleError) {
      toast.error("Failed to assign contractor role");
      return;
    }

    toast.success(`Contractor added! Login: ${formData.email} | Password: ${tempPassword}`, {
      duration: 10000,
    });
    setDialogOpen(false);
    setFormData({ email: "", full_name: "", phone: "" });
    fetchContractors();
  };

  return (
    <div className="space-y-4">
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button onClick={() => setFormData({ email: "", full_name: "", phone: "" })}>
            Add Contractor
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contractor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Enter email"
              />
            </div>
            <div>
              <Label>Full Name *</Label>
              <Input
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="Enter full name"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="Enter phone number"
              />
            </div>
            <Button onClick={handleAddContractor} className="w-full">
              Add Contractor
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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