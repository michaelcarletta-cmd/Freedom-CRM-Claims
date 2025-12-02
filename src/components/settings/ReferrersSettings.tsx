import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Edit } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { CredentialsDialog } from "@/components/CredentialsDialog";

interface Referrer {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
}

export function ReferrersSettings() {
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [referrerToDelete, setReferrerToDelete] = useState<Referrer | null>(null);
  const [editingReferrer, setEditingReferrer] = useState<Referrer | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    company: "",
    phone: "",
    email: "",
  });
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchReferrers();
  }, []);

  const fetchReferrers = async () => {
    try {
      const { data, error } = await supabase
        .from("referrers")
        .select("*")
        .order("name");

      if (error) throw error;
      setReferrers(data || []);
    } catch (error: any) {
      console.error("Error fetching referrers:", error);
      toast({
        title: "Error",
        description: "Failed to load referrers",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingReferrer) {
        const { error } = await supabase
          .from("referrers")
          .update({
            name: formData.name.trim(),
            company: formData.company.trim() || null,
            phone: formData.phone.trim() || null,
            email: formData.email.trim() || null,
          })
          .eq("id", editingReferrer.id);

        if (error) throw error;
        toast({ title: "Success", description: "Referrer updated" });
      } else {
        let tempPassword: string | null = null;
        
        // Create user account if email is provided
        if (formData.email.trim()) {
          tempPassword = Math.random().toString(36).slice(-8) + "A1!";
          
          // Use edge function to create user without auto-login
          const { data: funcData, error: funcError } = await supabase.functions.invoke(
            "create-portal-user",
            {
              body: {
                email: formData.email.trim(),
                password: tempPassword,
                fullName: formData.name.trim(),
                role: "referrer",
                phone: formData.phone.trim() || undefined,
              },
            }
          );

          if (funcError) throw funcError;
          if (funcData?.error) throw new Error(funcData.error);
        }

        // Create referrer record
        const { error } = await supabase
          .from("referrers")
          .insert({
            name: formData.name.trim(),
            company: formData.company.trim() || null,
            phone: formData.phone.trim() || null,
            email: formData.email.trim() || null,
          });

        if (error) throw error;
        
        if (tempPassword && formData.email.trim()) {
          setCredentials({ email: formData.email.trim(), password: tempPassword });
        } else {
          toast({ title: "Success", description: "Referrer added (no portal access - email required)" });
        }
      }

      setDialogOpen(false);
      setEditingReferrer(null);
      setFormData({ name: "", company: "", phone: "", email: "" });
      fetchReferrers();
    } catch (error: any) {
      let errorMessage = "Failed to save referrer";
      
      // Check for duplicate email error
      if (error.message?.includes("already been registered") || error.message?.includes("email_exists")) {
        errorMessage = "This email address is already registered. Please use a different email.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
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

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("referrers")
        .update({ is_active: isActive })
        .eq("id", id);

      if (error) throw error;

      setReferrers(referrers.map(r => r.id === id ? { ...r, is_active: isActive } : r));
      
      toast({
        title: "Success",
        description: `Referrer ${isActive ? "activated" : "deactivated"}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to update referrer",
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = (referrer: Referrer) => {
    setReferrerToDelete(referrer);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!referrerToDelete) return;

    try {
      // If referrer has email, delete the auth user first
      if (referrerToDelete.email) {
        // Find the auth user by email
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", referrerToDelete.email)
          .maybeSingle();

        if (profileData?.id) {
          // Delete the auth user via edge function
          await supabase.functions.invoke("delete-user", {
            body: { userId: profileData.id },
          });
        }
      }

      // Delete the referrer record
      const { error } = await supabase
        .from("referrers")
        .delete()
        .eq("id", referrerToDelete.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Referrer deleted completely",
      });

      fetchReferrers();
    } catch (error: any) {
      console.error("Delete error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete referrer",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setReferrerToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Referrers</h3>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingReferrer(null);
            setFormData({ name: "", company: "", phone: "", email: "" });
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Referrer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingReferrer ? "Edit Referrer" : "Add New Referrer"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="ABC Corporation"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john@example.com"
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave}>
                  {editingReferrer ? "Update" : "Add"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-6">
        <div className="space-y-3">
          {referrers.map((referrer) => (
            <div
              key={referrer.id}
              className="flex items-center justify-between p-4 border border-border rounded-lg"
            >
              <div>
                <p className="text-foreground font-medium">{referrer.name}</p>
                {referrer.company && (
                  <p className="text-sm text-muted-foreground">{referrer.company}</p>
                )}
                <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                  {referrer.phone && <span>{referrer.phone}</span>}
                  {referrer.email && <span>{referrer.email}</span>}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor={`active-${referrer.id}`} className="text-sm">Active</Label>
                  <Switch
                    id={`active-${referrer.id}`}
                    checked={referrer.is_active}
                    onCheckedChange={(checked) => handleToggleActive(referrer.id, checked)}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEdit(referrer)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteClick(referrer)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Referrer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this referrer? This will also remove their portal access and cannot be undone.
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
          userType="Referrer"
        />
      )}
    </div>
  );
}
