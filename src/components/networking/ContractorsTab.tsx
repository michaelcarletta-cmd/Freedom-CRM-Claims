import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { UserPlus, Mail, Phone, Search } from "lucide-react";

interface Contractor {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
}

export const ContractorsTab = () => {
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [filteredContractors, setFilteredContractors] = useState<Contractor[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    phone: "",
  });

  useEffect(() => {
    fetchContractors();
  }, []);

  useEffect(() => {
    const filtered = contractors.filter((contractor) => {
      const searchLower = searchQuery.toLowerCase();
      return (
        contractor.full_name?.toLowerCase().includes(searchLower) ||
        contractor.email.toLowerCase().includes(searchLower) ||
        contractor.phone?.toLowerCase().includes(searchLower)
      );
    });
    setFilteredContractors(filtered);
  }, [contractors, searchQuery]);

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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Contractors</CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setFormData({ email: "", full_name: "", phone: "" })}>
              <UserPlus className="h-4 w-4 mr-2" />
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
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {filteredContractors.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {contractors.length === 0 ? "No contractors found" : "No contractors match your search"}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredContractors.map((contractor) => (
                <TableRow key={contractor.id}>
                  <TableCell className="font-medium">
                    {contractor.full_name || "No name"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {contractor.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    {contractor.phone ? (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        {contractor.phone}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};