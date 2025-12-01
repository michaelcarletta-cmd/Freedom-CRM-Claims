import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface InsuranceCompany {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
}

export function InsuranceCompaniesSettings() {
  const [companies, setCompanies] = useState<InsuranceCompany[]>([]);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyPhone, setNewCompanyPhone] = useState("");
  const [newCompanyEmail, setNewCompanyEmail] = useState("");
  const [editingCompany, setEditingCompany] = useState<InsuranceCompany | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from("insurance_companies")
        .select("*")
        .order("name");

      if (error) throw error;
      setCompanies(data || []);
    } catch (error: any) {
      console.error("Error fetching companies:", error);
      toast({
        title: "Error",
        description: "Failed to load insurance companies",
        variant: "destructive",
      });
    }
  };

  const handleAdd = async () => {
    if (!newCompanyName.trim()) return;

    setLoading(true);
    try {
      if (editingCompany) {
        const { error } = await supabase
          .from("insurance_companies")
          .update({
            name: newCompanyName.trim(),
            phone: newCompanyPhone.trim() || null,
            email: newCompanyEmail.trim() || null,
          })
          .eq("id", editingCompany.id);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Insurance company updated",
        });
      } else {
        const { error } = await supabase
          .from("insurance_companies")
          .insert({
            name: newCompanyName.trim(),
            phone: newCompanyPhone.trim() || null,
            email: newCompanyEmail.trim() || null,
          });

        if (error) throw error;

        toast({
          title: "Success",
          description: "Insurance company added",
        });
      }

      setNewCompanyName("");
      setNewCompanyPhone("");
      setNewCompanyEmail("");
      setEditingCompany(null);
      fetchCompanies();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save insurance company",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (company: InsuranceCompany) => {
    setEditingCompany(company);
    setNewCompanyName(company.name);
    setNewCompanyPhone(company.phone || "");
    setNewCompanyEmail(company.email || "");
    
    // Scroll to the form
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handleCancel = () => {
    setEditingCompany(null);
    setNewCompanyName("");
    setNewCompanyPhone("");
    setNewCompanyEmail("");
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("insurance_companies")
        .update({ is_active: isActive })
        .eq("id", id);

      if (error) throw error;

      setCompanies(companies.map(c => c.id === id ? { ...c, is_active: isActive } : c));
      
      toast({
        title: "Success",
        description: `Insurance company ${isActive ? "activated" : "deactivated"}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to update insurance company",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this insurance company?")) return;

    try {
      const { error } = await supabase
        .from("insurance_companies")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Insurance company deleted",
      });

      fetchCompanies();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to delete insurance company",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card ref={formRef} className="p-6">
        <h3 className="text-lg font-semibold mb-4">
          {editingCompany ? "Edit Insurance Company" : "Add New Insurance Company"}
        </h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="newCompany">Company Name *</Label>
            <Input
              id="newCompany"
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
              placeholder="Enter insurance company name"
            />
          </div>
          <div>
            <Label htmlFor="companyPhone">Phone</Label>
            <Input
              id="companyPhone"
              value={newCompanyPhone}
              onChange={(e) => setNewCompanyPhone(e.target.value)}
              placeholder="Enter phone number"
            />
          </div>
          <div>
            <Label htmlFor="companyEmail">Email</Label>
            <Input
              id="companyEmail"
              type="email"
              value={newCompanyEmail}
              onChange={(e) => setNewCompanyEmail(e.target.value)}
              placeholder="Enter email address"
            />
          </div>
          <div className="flex gap-3">
            {editingCompany && (
              <Button onClick={handleCancel} variant="outline" className="flex-1">
                Cancel
              </Button>
            )}
            <Button 
              onClick={handleAdd} 
              disabled={loading || !newCompanyName.trim()} 
              className="flex-1"
            >
              <Plus className="h-4 w-4 mr-2" />
              {editingCompany ? "Update" : "Add"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Existing Insurance Companies</h3>
        <div className="space-y-3">
          {companies.map((company) => (
            <div
              key={company.id}
              className="flex items-center justify-between p-3 border border-border rounded-lg"
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
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEdit(company)}
                >
                  Edit
                </Button>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`active-${company.id}`} className="text-sm">Active</Label>
                  <Switch
                    id={`active-${company.id}`}
                    checked={company.is_active}
                    onCheckedChange={(checked) => handleToggleActive(company.id, checked)}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(company.id)}
                  className="text-destructive hover:text-destructive"
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
}
