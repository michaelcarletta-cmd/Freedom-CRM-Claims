import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Calendar, User, Trash2, ClipboardCheck, Edit } from "lucide-react";
import { format, isPast } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface Inspection {
  id: string;
  inspection_date: string;
  inspection_time: string | null;
  inspection_type: string | null;
  inspector_name: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

interface ClaimInspectionsProps {
  claimId: string;
}

export function ClaimInspections({ claimId }: ClaimInspectionsProps) {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingInspection, setEditingInspection] = useState<Inspection | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    inspection_date: "",
    inspection_time: "",
    inspection_type: "",
    inspector_name: "",
    notes: "",
  });

  useEffect(() => {
    fetchInspections();

    const channel = supabase
      .channel(`claim-inspections-${claimId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inspections",
          filter: `claim_id=eq.${claimId}`,
        },
        () => {
          fetchInspections();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [claimId]);

  const fetchInspections = async () => {
    try {
      const { data, error } = await supabase
        .from("inspections")
        .select("*")
        .eq("claim_id", claimId)
        .order("inspection_date", { ascending: false });

      if (error) throw error;

      setInspections(data || []);
    } catch (error: any) {
      console.error("Error fetching inspections:", error);
      toast({
        title: "Error",
        description: "Failed to load inspections",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (editingInspection) {
        // Update existing inspection
        const { error } = await supabase
          .from("inspections")
          .update({
            inspection_date: formData.inspection_date,
            inspection_time: formData.inspection_time || null,
            inspection_type: formData.inspection_type || null,
            inspector_name: formData.inspector_name || null,
            notes: formData.notes || null,
          })
          .eq("id", editingInspection.id);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Inspection updated successfully",
        });
      } else {
        // Create new inspection
        const { error } = await supabase.from("inspections").insert({
          claim_id: claimId,
          inspection_date: formData.inspection_date,
          inspection_time: formData.inspection_time || null,
          inspection_type: formData.inspection_type || null,
          inspector_name: formData.inspector_name || null,
          notes: formData.notes || null,
          created_by: user?.id,
        });

        if (error) throw error;

        toast({
          title: "Success",
          description: "Inspection scheduled successfully",
        });
      }

      setOpen(false);
      setEditingInspection(null);
      setFormData({
        inspection_date: "",
        inspection_time: "",
        inspection_type: "",
        inspector_name: "",
        notes: "",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || (editingInspection ? "Failed to update inspection" : "Failed to schedule inspection"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (inspection: Inspection) => {
    setEditingInspection(inspection);
    setFormData({
      inspection_date: inspection.inspection_date,
      inspection_time: inspection.inspection_time || "",
      inspection_type: inspection.inspection_type || "",
      inspector_name: inspection.inspector_name || "",
      notes: inspection.notes || "",
    });
    setOpen(true);
  };

  const handleStatusChange = async (inspectionId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("inspections")
        .update({ status: newStatus })
        .eq("id", inspectionId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Inspection marked as ${newStatus}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to update inspection status",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (inspectionId: string) => {
    if (!confirm("Are you sure you want to delete this inspection?")) return;

    try {
      const { error } = await supabase.from("inspections").delete().eq("id", inspectionId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Inspection deleted successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to delete inspection",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "default";
      case "scheduled":
        return "secondary";
      case "cancelled":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Inspections</h3>
        <Dialog open={open} onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) {
            setEditingInspection(null);
            setFormData({
              inspection_date: "",
              inspection_time: "",
              inspection_type: "",
              inspector_name: "",
              notes: "",
            });
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Schedule Inspection
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingInspection ? "Edit Inspection" : "Schedule New Inspection"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="inspection_date">Inspection Date *</Label>
                  <Input
                    id="inspection_date"
                    type="date"
                    required
                    value={formData.inspection_date}
                    onChange={(e) => setFormData({ ...formData, inspection_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inspection_time">Inspection Time</Label>
                  <Input
                    id="inspection_time"
                    type="time"
                    value={formData.inspection_time}
                    onChange={(e) => setFormData({ ...formData, inspection_time: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="inspection_type">Inspection Type</Label>
                <Select
                  value={formData.inspection_type}
                  onValueChange={(value) => setFormData({ ...formData, inspection_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Initial">Initial Inspection</SelectItem>
                    <SelectItem value="Follow-up">Follow-up Inspection</SelectItem>
                    <SelectItem value="Final">Final Inspection</SelectItem>
                    <SelectItem value="Re-inspection">Re-inspection</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="inspector_name">Inspector Name</Label>
                <Input
                  id="inspector_name"
                  value={formData.inspector_name}
                  onChange={(e) => setFormData({ ...formData, inspector_name: e.target.value })}
                  placeholder="Enter inspector name (optional)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Add inspection details..."
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? (editingInspection ? "Updating..." : "Scheduling...") : (editingInspection ? "Update Inspection" : "Schedule Inspection")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {inspections.length === 0 ? (
        <Card className="p-8 text-center border-border bg-card">
          <ClipboardCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">No inspections scheduled yet</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {inspections.map((inspection) => {
            const inspectionDate = new Date(inspection.inspection_date);
            const isUpcoming = !isPast(inspectionDate) && inspection.status === "scheduled";
            const isPastDue = isPast(inspectionDate) && inspection.status === "scheduled";

            return (
              <Card
                key={inspection.id}
                className={`p-4 border-border ${
                  inspection.status === "completed" ? "opacity-60" : ""
                } ${isPastDue ? "border-red-500" : ""} ${isUpcoming ? "border-blue-500" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span
                        className={`font-medium ${
                          isPastDue ? "text-red-600 dark:text-red-400" : "text-foreground"
                        }`}
                      >
                        {format(inspectionDate, "MMMM d, yyyy")}
                        {inspection.inspection_time && ` at ${inspection.inspection_time}`}
                      </span>
                      <Badge variant={getStatusColor(inspection.status) as any}>
                        {inspection.status.charAt(0).toUpperCase() + inspection.status.slice(1)}
                      </Badge>
                      {inspection.inspection_type && (
                        <Badge variant="outline">{inspection.inspection_type}</Badge>
                      )}
                    </div>

                    {inspection.inspector_name && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                        <User className="h-4 w-4" />
                        <span>{inspection.inspector_name}</span>
                      </div>
                    )}

                    {inspection.notes && (
                      <p className="text-sm text-muted-foreground mt-2">{inspection.notes}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {inspection.status === "scheduled" && (
                      <Select
                        value={inspection.status}
                        onValueChange={(value) => handleStatusChange(inspection.id, value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(inspection)}
                      className="hover:text-primary"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(inspection.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
