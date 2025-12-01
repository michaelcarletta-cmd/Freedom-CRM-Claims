import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Building2, Mail, Phone, Pencil, Plus } from "lucide-react";

interface InsuranceCompany {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
}

export const InsuranceCompaniesTab = () => {
  const [companies, setCompanies] = useState<InsuranceCompany[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<InsuranceCompany | null>(null);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyPhone, setNewCompanyPhone] = useState("");
  const [newCompanyEmail, setNewCompanyEmail] = useState("");

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    const { data, error } = await supabase
      .from("insurance_companies")
      .select("*")
      .order("name");

    if (error) {
      toast.error("Failed to fetch insurance companies");
      return;
    }

    setCompanies(data || []);
  };

  const handleAdd = async () => {
    if (!newCompanyName.trim()) {
      toast.error("Company name is required");
      return;
    }

    if (editingCompany) {
      const { error } = await supabase
        .from("insurance_companies")
        .update({
          name: newCompanyName,
          phone: newCompanyPhone || null,
          email: newCompanyEmail || null,
        })
        .eq("id", editingCompany.id);

      if (error) {
        toast.error("Failed to update company");
        return;
      }

      toast.success("Company updated");
    } else {
      const { error } = await supabase
        .from("insurance_companies")
        .insert([{
          name: newCompanyName,
          phone: newCompanyPhone || null,
          email: newCompanyEmail || null,
        }]);

      if (error) {
        toast.error("Failed to add company");
        return;
      }

      toast.success("Company added");
    }

    setNewCompanyName("");
    setNewCompanyPhone("");
    setNewCompanyEmail("");
    setEditingCompany(null);
    setDialogOpen(false);
    fetchCompanies();
  };

  const handleEdit = (company: InsuranceCompany) => {
    setEditingCompany(company);
    setNewCompanyName(company.name);
    setNewCompanyPhone(company.phone || "");
    setNewCompanyEmail(company.email || "");
    setDialogOpen(true);
  };

  const handleToggleActive = async (company: InsuranceCompany) => {
    const { error } = await supabase
      .from("insurance_companies")
      .update({ is_active: !company.is_active })
      .eq("id", company.id);

    if (error) {
      toast.error("Failed to update company");
      return;
    }

    toast.success(`Company ${company.is_active ? "deactivated" : "activated"}`);
    fetchCompanies();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this company?")) return;

    const { error } = await supabase
      .from("insurance_companies")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Failed to delete company");
      return;
    }

    toast.success("Company deleted");
    fetchCompanies();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-muted-foreground">
          Track insurance companies you work with on claims
        </p>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setNewCompanyName("");
            setNewCompanyPhone("");
            setNewCompanyEmail("");
            setEditingCompany(null);
          }
        }}>
          <DialogTrigger asChild>
            <Button size="lg" className="gap-2">
              <Plus className="h-4 w-4" />
              Add Insurance Company
            </Button>
          </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCompany ? "Edit" : "Add"} Insurance Company</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Company Name *</Label>
              <Input
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                placeholder="Enter company name"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={newCompanyPhone}
                onChange={(e) => setNewCompanyPhone(e.target.value)}
                placeholder="Enter phone number"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={newCompanyEmail}
                onChange={(e) => setNewCompanyEmail(e.target.value)}
                placeholder="Enter email address"
              />
            </div>
            <Button onClick={handleAdd} className="w-full">
              {editingCompany ? "Update" : "Add"} Company
            </Button>
          </div>
        </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {companies.map((company) => (
          <Card key={company.id} className="p-6 hover:shadow-lg transition-shadow duration-200">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg truncate">{company.name}</h3>
                  </div>
                </div>
                <Switch
                  checked={company.is_active}
                  onCheckedChange={() => handleToggleActive(company)}
                />
              </div>
              
              <div className="space-y-2.5">
                {company.email && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{company.email}</span>
                  </div>
                )}
                {company.phone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-4 w-4 flex-shrink-0" />
                    <span>{company.phone}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(company)}
                  className="flex-1 gap-2"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(company.id)}
                  className="gap-2"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};