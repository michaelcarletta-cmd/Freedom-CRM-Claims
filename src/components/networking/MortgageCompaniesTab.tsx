import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Trash2, Building2, Mail, Phone, User, Plus } from "lucide-react";

interface MortgageCompany {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
}

export const MortgageCompaniesTab = () => {
  const [companies, setCompanies] = useState<MortgageCompany[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<MortgageCompany | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    contact_name: "",
    phone: "",
    email: "",
  });

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    const { data, error } = await supabase
      .from("mortgage_companies")
      .select("*")
      .order("name");

    if (error) {
      toast.error("Failed to fetch mortgage companies");
      return;
    }

    setCompanies(data || []);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Company name is required");
      return;
    }

    if (editingCompany) {
      const { error } = await supabase
        .from("mortgage_companies")
        .update(formData)
        .eq("id", editingCompany.id);

      if (error) {
        toast.error("Failed to update company");
        return;
      }
      toast.success("Company updated");
    } else {
      const { error } = await supabase
        .from("mortgage_companies")
        .insert([formData]);

      if (error) {
        toast.error("Failed to add company");
        return;
      }
      toast.success("Company added");
    }

    setDialogOpen(false);
    setFormData({ name: "", contact_name: "", phone: "", email: "" });
    setEditingCompany(null);
    fetchCompanies();
  };

  const handleEdit = (company: MortgageCompany) => {
    setEditingCompany(company);
    setFormData({
      name: company.name,
      contact_name: company.contact_name || "",
      phone: company.phone || "",
      email: company.email || "",
    });
    setDialogOpen(true);
  };

  const handleToggleActive = async (company: MortgageCompany) => {
    const { error } = await supabase
      .from("mortgage_companies")
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
      .from("mortgage_companies")
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
          Manage mortgage companies associated with your claims
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setEditingCompany(null);
              setFormData({ name: "", contact_name: "", phone: "", email: "" });
            }} size="lg" className="gap-2">
              <Plus className="h-4 w-4" />
              Add Mortgage Company
            </Button>
          </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCompany ? "Edit" : "Add"} Mortgage Company</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Company Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter company name"
              />
            </div>
            <div>
              <Label>Contact Name</Label>
              <Input
                value={formData.contact_name}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                placeholder="Enter contact name"
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
            <div>
              <Label>Email</Label>
              <Input
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Enter email"
              />
            </div>
            <Button onClick={handleSave} className="w-full">
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
                    {company.contact_name && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                        <User className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{company.contact_name}</span>
                      </div>
                    )}
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