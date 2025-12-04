import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { UserPlus, Mail, Phone, Building, Search } from "lucide-react";
import { formatPhoneNumber } from "@/lib/utils";

interface Referrer {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
}

export const ReferrersTab = () => {
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [filteredReferrers, setFilteredReferrers] = useState<Referrer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    phone: "",
    company: "",
  });

  useEffect(() => {
    fetchReferrers();
  }, []);

  useEffect(() => {
    const filtered = referrers.filter((referrer) => {
      const searchLower = searchQuery.toLowerCase();
      return (
        referrer.name.toLowerCase().includes(searchLower) ||
        referrer.email?.toLowerCase().includes(searchLower) ||
        referrer.phone?.toLowerCase().includes(searchLower) ||
        referrer.company?.toLowerCase().includes(searchLower)
      );
    });
    setFilteredReferrers(filtered);
  }, [referrers, searchQuery]);

  const fetchReferrers = async () => {
    const { data, error } = await supabase
      .from("referrers")
      .select("*")
      .order("name");

    if (error) {
      toast.error("Failed to fetch referrers");
      return;
    }

    setReferrers(data || []);
  };

  const handleAddReferrer = async () => {
    if (!formData.name.trim() || !formData.email.trim()) {
      toast.error("Name and email are required");
      return;
    }

    // Create a temporary password for the referrer
    const tempPassword = Math.random().toString(36).slice(-8) + "A1!";

    // Sign up the user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: formData.email,
      password: tempPassword,
      options: {
        data: {
          full_name: formData.name,
          role: 'referrer',
        },
      },
    });

    if (authError) {
      toast.error("Failed to create referrer: " + authError.message);
      return;
    }

    if (!authData.user) {
      toast.error("Failed to create referrer");
      return;
    }

    // Add to referrers table
    const { error: referrerError } = await supabase
      .from("referrers")
      .insert([{
        name: formData.name,
        email: formData.email,
        phone: formData.phone || null,
        company: formData.company || null,
      }]);

    if (referrerError) {
      toast.error("Failed to add referrer details");
      return;
    }

    toast.success(`Referrer added! Login: ${formData.email} | Password: ${tempPassword}`, {
      duration: 10000,
    });
    setDialogOpen(false);
    setFormData({ email: "", name: "", phone: "", company: "" });
    fetchReferrers();
  };

  return (
    <Card>
      <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <CardTitle>Referrers</CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setFormData({ email: "", name: "", phone: "", company: "" })}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Referrer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Referrer</DialogTitle>
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
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter name"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: formatPhoneNumber(e.target.value) })}
                  placeholder="123-456-7890"
                />
              </div>
              <div>
                <Label>Company</Label>
                <Input
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="Enter company name"
                />
              </div>
              <Button onClick={handleAddReferrer} className="w-full">
                Add Referrer
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, company, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {filteredReferrers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {referrers.length === 0 ? "No referrers found" : "No referrers match your search"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Name</TableHead>
                  <TableHead className="whitespace-nowrap">Company</TableHead>
                  <TableHead className="whitespace-nowrap">Email</TableHead>
                  <TableHead className="whitespace-nowrap">Phone</TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
              {filteredReferrers.map((referrer) => (
                <TableRow key={referrer.id}>
                  <TableCell className="font-medium">{referrer.name}</TableCell>
                  <TableCell>
                    {referrer.company ? (
                      <div className="flex items-center gap-2">
                        <Building className="h-4 w-4 text-muted-foreground" />
                        {referrer.company}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {referrer.email ? (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        {referrer.email}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {referrer.phone ? (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        {referrer.phone}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};