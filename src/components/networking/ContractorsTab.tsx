import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, Mail, Phone, User } from "lucide-react";

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
          role: 'contractor',
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

    toast.success(`Contractor added! Login: ${formData.email} | Password: ${tempPassword}`, {
      duration: 10000,
    });
    setDialogOpen(false);
    setFormData({ email: "", full_name: "", phone: "" });
    fetchContractors();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-muted-foreground">
          Manage contractors who can access their assigned claims
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setFormData({ email: "", full_name: "", phone: "" })} size="lg" className="gap-2">
              <UserPlus className="h-4 w-4" />
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
      </div>

      {contractors.length === 0 ? (
        <Card className="p-12">
          <div className="text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <UserPlus className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">
              No contractors found. Contractors are users with the contractor role.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {contractors.map((contractor) => (
            <Card key={contractor.id} className="p-6 hover:shadow-lg transition-shadow duration-200">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg truncate">{contractor.full_name || "No name"}</h3>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{contractor.email}</span>
                  </div>
                  {contractor.phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-4 w-4 flex-shrink-0" />
                      <span>{contractor.phone}</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};