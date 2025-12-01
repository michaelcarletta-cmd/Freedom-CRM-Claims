import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Trash2, UserPlus, Mail, Phone, Building2, User } from "lucide-react";

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReferrer, setEditingReferrer] = useState<Referrer | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    company: "",
    phone: "",
    email: "",
  });

  useEffect(() => {
    fetchReferrers();
  }, []);

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

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }

    if (editingReferrer) {
      const { error } = await supabase
        .from("referrers")
        .update(formData)
        .eq("id", editingReferrer.id);

      if (error) {
        toast.error("Failed to update referrer");
        return;
      }
      toast.success("Referrer updated");
    } else {
      const { error } = await supabase
        .from("referrers")
        .insert([formData]);

      if (error) {
        toast.error("Failed to add referrer");
        return;
      }
      toast.success("Referrer added");
    }

    setDialogOpen(false);
    setFormData({ name: "", company: "", phone: "", email: "" });
    setEditingReferrer(null);
    fetchReferrers();
  };

  const handleEdit = (referrer: Referrer) => {
    setEditingReferrer(referrer);
    setFormData({
      name: referrer.name,
      company: referrer.company || "",
      phone: referrer.phone || "",
      email: referrer.email || "",
    });
    setDialogOpen(true);
  };

  const handleToggleActive = async (referrer: Referrer) => {
    const { error } = await supabase
      .from("referrers")
      .update({ is_active: !referrer.is_active })
      .eq("id", referrer.id);

    if (error) {
      toast.error("Failed to update referrer");
      return;
    }

    toast.success(`Referrer ${referrer.is_active ? "deactivated" : "activated"}`);
    fetchReferrers();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this referrer?")) return;

    const { error } = await supabase
      .from("referrers")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Failed to delete referrer");
      return;
    }

    toast.success("Referrer deleted");
    fetchReferrers();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-muted-foreground">
          Manage referrers who send claims to your business
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setEditingReferrer(null);
              setFormData({ name: "", company: "", phone: "", email: "" });
            }} size="lg" className="gap-2">
              <UserPlus className="h-4 w-4" />
              Add Referrer
            </Button>
          </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingReferrer ? "Edit" : "Add"} Referrer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter name"
              />
            </div>
            <div>
              <Label>Company</Label>
              <Input
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder="Enter company"
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
              {editingReferrer ? "Update" : "Add"} Referrer
            </Button>
          </div>
        </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {referrers.map((referrer) => (
          <Card key={referrer.id} className="p-6 hover:shadow-lg transition-shadow duration-200">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg truncate">{referrer.name}</h3>
                    {referrer.company && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                        <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{referrer.company}</span>
                      </div>
                    )}
                  </div>
                </div>
                <Switch
                  checked={referrer.is_active}
                  onCheckedChange={() => handleToggleActive(referrer)}
                />
              </div>
              
              <div className="space-y-2.5">
                {referrer.email && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{referrer.email}</span>
                  </div>
                )}
                {referrer.phone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-4 w-4 flex-shrink-0" />
                    <span>{referrer.phone}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(referrer)}
                  className="flex-1 gap-2"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(referrer.id)}
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