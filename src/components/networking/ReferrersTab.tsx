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
    <div className="space-y-4">
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button onClick={() => {
            setEditingReferrer(null);
            setFormData({ name: "", company: "", phone: "", email: "" });
          }}>
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

      <Card className="p-4">
        <div className="space-y-2">
          {referrers.map((referrer) => (
            <div
              key={referrer.id}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div className="flex-1">
                <div className="font-medium">{referrer.name}</div>
                {referrer.company && (
                  <div className="text-sm text-muted-foreground">Company: {referrer.company}</div>
                )}
                {referrer.phone && (
                  <div className="text-sm text-muted-foreground">Phone: {referrer.phone}</div>
                )}
                {referrer.email && (
                  <div className="text-sm text-muted-foreground">Email: {referrer.email}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={referrer.is_active}
                  onCheckedChange={() => handleToggleActive(referrer)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEdit(referrer)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(referrer.id)}
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