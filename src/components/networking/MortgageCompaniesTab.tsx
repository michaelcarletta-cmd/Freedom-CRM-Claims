import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";

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
    <div className="space-y-4">
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button onClick={() => {
            setEditingCompany(null);
            setFormData({ name: "", contact_name: "", phone: "", email: "" });
          }}>
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

      <Card className="p-4">
        <div className="space-y-2">
          {companies.map((company) => (
            <div
              key={company.id}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div className="flex-1">
                <div className="font-medium">{company.name}</div>
                {company.contact_name && (
                  <div className="text-sm text-muted-foreground">Contact: {company.contact_name}</div>
                )}
                {company.phone && (
                  <div className="text-sm text-muted-foreground">Phone: {company.phone}</div>
                )}
                {company.email && (
                  <div className="text-sm text-muted-foreground">Email: {company.email}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={company.is_active}
                  onCheckedChange={() => handleToggleActive(company)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEdit(company)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(company.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};