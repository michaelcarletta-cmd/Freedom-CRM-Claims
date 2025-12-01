import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

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
    <div className="space-y-4">
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
          <Button>
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

      <Card className="p-4">
        <div className="space-y-2">
          {companies.map((company) => (
            <div
              key={company.id}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div className="flex-1">
                <div className="font-medium">{company.name}</div>
                {(company.phone || company.email) && (
                  <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                    {company.phone && <div>Phone: {company.phone}</div>}
                    {company.email && <div>Email: {company.email}</div>}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEdit(company)}
                >
                  Edit
                </Button>
                <Switch
                  checked={company.is_active}
                  onCheckedChange={() => handleToggleActive(company)}
                />
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