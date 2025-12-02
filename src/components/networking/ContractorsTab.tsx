import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { UserPlus, Mail, Phone, Search, Trash2 } from "lucide-react";
import { CredentialsDialog } from "@/components/CredentialsDialog";

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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contractorToDelete, setContractorToDelete] = useState<Contractor | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    phone: "",
  });
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

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

    // Use edge function to create user without auto-login
    const { data: funcData, error: funcError } = await supabase.functions.invoke(
      "create-portal-user",
      {
        body: {
          email: formData.email,
          password: tempPassword,
          fullName: formData.full_name,
          role: "contractor",
          phone: formData.phone || undefined,
        },
      }
    );

    if (funcError) {
      toast.error("Failed to create contractor: " + funcError.message);
      return;
    }

    if (funcData?.error) {
      toast.error("Failed to create contractor: " + funcData.error);
      return;
    }

    setDialogOpen(false);
    setFormData({ email: "", full_name: "", phone: "" });
    setCredentials({ email: formData.email, password: tempPassword });
    fetchContractors();
  };

  const handleDeleteClick = (contractor: Contractor) => {
    setContractorToDelete(contractor);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!contractorToDelete) return;

    try {
      // Delete the auth user via edge function
      await supabase.functions.invoke("delete-user", {
        body: { userId: contractorToDelete.id },
      });

      toast.success("Contractor deleted completely");
      fetchContractors();
    } catch (error: any) {
      console.error("Delete error:", error);
      toast.error(error.message || "Failed to delete contractor");
    } finally {
      setDeleteDialogOpen(false);
      setContractorToDelete(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
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
          <div className="overflow-x-auto">
            <Table className="min-w-[500px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Name</TableHead>
                  <TableHead className="whitespace-nowrap">Email</TableHead>
                  <TableHead className="whitespace-nowrap">Phone</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
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
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteClick(contractor)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contractor</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this contractor? This will also remove their portal access and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {credentials && (
        <CredentialsDialog
          isOpen={!!credentials}
          onClose={() => setCredentials(null)}
          email={credentials.email}
          password={credentials.password}
          userType="Contractor"
        />
      )}
    </Card>
  );
};
