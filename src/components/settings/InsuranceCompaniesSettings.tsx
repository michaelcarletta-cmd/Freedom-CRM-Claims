import { useState, useEffect } from "react";
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
  is_active: boolean;
}

export function InsuranceCompaniesSettings() {
  const [companies, setCompanies] = useState<InsuranceCompany[]>([]);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

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
      const { error } = await supabase
        .from("insurance_companies")
        .insert({ name: newCompanyName.trim() });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Insurance company added",
      });

      setNewCompanyName("");
      fetchCompanies();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add insurance company",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
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
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Add New Insurance Company</h3>
        <div className="flex gap-3">
          <div className="flex-1">
            <Label htmlFor="newCompany">Company Name</Label>
            <Input
              id="newCompany"
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
              placeholder="Enter insurance company name"
              onKeyPress={(e) => e.key === "Enter" && handleAdd()}
            />
          </div>
          <Button onClick={handleAdd} disabled={loading || !newCompanyName.trim()} className="mt-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
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
              <span className="text-foreground font-medium">{company.name}</span>
              <div className="flex items-center gap-4">
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
