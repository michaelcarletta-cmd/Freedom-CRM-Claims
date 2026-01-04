import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Users, Plus, Trash2, Edit, Link2 } from "lucide-react";
import { format } from "date-fns";

interface ClaimPartnerAssignmentProps {
  claimId: string;
}

interface LinkedWorkspace {
  id: string;
  workspace_id: string;
  instance_name: string;
  external_instance_url: string;
  target_sales_rep_id: string | null;
  target_sales_rep_name: string | null;
}

interface PartnerAssignment {
  id: string;
  claim_id: string;
  linked_workspace_id: string;
  sales_rep_id: string | null;
  sales_rep_name: string;
  sales_rep_email: string | null;
  assigned_at: string;
  linked_workspaces?: {
    instance_name: string;
    external_instance_url: string;
  };
}

export function ClaimPartnerAssignment({ claimId }: ClaimPartnerAssignmentProps) {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<PartnerAssignment | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [formData, setFormData] = useState({
    sales_rep_name: "",
    sales_rep_email: "",
    sales_rep_id: "",
  });

  // Fetch linked workspaces (partner instances)
  const { data: linkedWorkspaces = [] } = useQuery({
    queryKey: ["linked-workspaces-for-assignment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("linked_workspaces")
        .select("id, workspace_id, instance_name, external_instance_url, target_sales_rep_id, target_sales_rep_name")
        .order("instance_name");
      if (error) throw error;
      return data as LinkedWorkspace[];
    },
  });

  // Fetch existing partner assignments for this claim
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["claim-partner-assignments", claimId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_partner_assignments")
        .select(`
          *,
          linked_workspaces (
            instance_name,
            external_instance_url
          )
        `)
        .eq("claim_id", claimId)
        .order("assigned_at", { ascending: false });
      if (error) throw error;
      return data as PartnerAssignment[];
    },
  });

  // Get workspaces that haven't been assigned yet
  const availableWorkspaces = linkedWorkspaces.filter(
    (ws) => !assignments.some((a) => a.linked_workspace_id === ws.id) || 
            (editingAssignment && editingAssignment.linked_workspace_id === ws.id)
  );

  const addMutation = useMutation({
    mutationFn: async (data: {
      linked_workspace_id: string;
      sales_rep_name: string;
      sales_rep_email?: string;
      sales_rep_id?: string;
    }) => {
      const { error } = await supabase.from("claim_partner_assignments").insert({
        claim_id: claimId,
        linked_workspace_id: data.linked_workspace_id,
        sales_rep_name: data.sales_rep_name,
        sales_rep_email: data.sales_rep_email || null,
        sales_rep_id: data.sales_rep_id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claim-partner-assignments", claimId] });
      toast.success("Partner sales rep assigned");
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast.error(`Failed to assign: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: {
        sales_rep_name: string;
        sales_rep_email?: string;
        sales_rep_id?: string;
      };
    }) => {
      const { error } = await supabase
        .from("claim_partner_assignments")
        .update({
          sales_rep_name: data.sales_rep_name,
          sales_rep_email: data.sales_rep_email || null,
          sales_rep_id: data.sales_rep_id || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claim-partner-assignments", claimId] });
      toast.success("Assignment updated");
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("claim_partner_assignments")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claim-partner-assignments", claimId] });
      toast.success("Assignment removed");
    },
    onError: (error: any) => {
      toast.error(`Failed to remove: ${error.message}`);
    },
  });

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingAssignment(null);
    setSelectedWorkspaceId("");
    setFormData({
      sales_rep_name: "",
      sales_rep_email: "",
      sales_rep_id: "",
    });
  };

  const handleOpenEdit = (assignment: PartnerAssignment) => {
    setEditingAssignment(assignment);
    setSelectedWorkspaceId(assignment.linked_workspace_id);
    setFormData({
      sales_rep_name: assignment.sales_rep_name,
      sales_rep_email: assignment.sales_rep_email || "",
      sales_rep_id: assignment.sales_rep_id || "",
    });
    setIsDialogOpen(true);
  };

  const handleSelectWorkspace = (workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
    // Pre-fill with default sales rep if workspace has one
    const workspace = linkedWorkspaces.find((ws) => ws.id === workspaceId);
    if (workspace?.target_sales_rep_name) {
      setFormData({
        sales_rep_name: workspace.target_sales_rep_name,
        sales_rep_email: "",
        sales_rep_id: workspace.target_sales_rep_id || "",
      });
    }
  };

  const handleSubmit = () => {
    if (!formData.sales_rep_name.trim()) {
      toast.error("Sales rep name is required");
      return;
    }

    if (editingAssignment) {
      updateMutation.mutate({
        id: editingAssignment.id,
        data: formData,
      });
    } else {
      if (!selectedWorkspaceId) {
        toast.error("Please select a partner instance");
        return;
      }
      addMutation.mutate({
        linked_workspace_id: selectedWorkspaceId,
        ...formData,
      });
    }
  };

  if (linkedWorkspaces.length === 0) {
    return null; // Don't show if no partner instances are configured
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Partner Sales Rep Assignment
          </CardTitle>
          <CardDescription>
            Assign sales reps from partner instances to this claim
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setIsDialogOpen(true)} disabled={availableWorkspaces.length === 0 && !editingAssignment}>
          <Plus className="h-4 w-4 mr-1" />
          Assign Rep
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading assignments...</p>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No partner sales reps assigned. Click "Assign Rep" to assign a sales rep from a partner instance.
          </p>
        ) : (
          <div className="space-y-3">
            {assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="flex items-center justify-between p-3 border rounded-lg bg-muted/20"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{assignment.sales_rep_name}</span>
                    <Badge variant="outline" className="text-xs">
                      <Link2 className="h-3 w-3 mr-1" />
                      {assignment.linked_workspaces?.instance_name || "Unknown Instance"}
                    </Badge>
                  </div>
                  {assignment.sales_rep_email && (
                    <p className="text-xs text-muted-foreground">
                      {assignment.sales_rep_email}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Assigned: {format(new Date(assignment.assigned_at), "MMM d, yyyy")}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleOpenEdit(assignment)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(assignment.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Assign/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAssignment ? "Edit Partner Assignment" : "Assign Partner Sales Rep"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {!editingAssignment && (
              <div className="grid gap-2">
                <Label>Partner Instance *</Label>
                <Select value={selectedWorkspaceId} onValueChange={handleSelectWorkspace}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select partner instance..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableWorkspaces.map((ws) => (
                      <SelectItem key={ws.id} value={ws.id}>
                        {ws.instance_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {editingAssignment && (
              <div className="p-2 bg-muted rounded-md">
                <p className="text-sm font-medium">{editingAssignment.linked_workspaces?.instance_name}</p>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="sales_rep_name">Sales Rep Name *</Label>
              <Input
                id="sales_rep_name"
                value={formData.sales_rep_name}
                onChange={(e) => setFormData({ ...formData, sales_rep_name: e.target.value })}
                placeholder="Enter sales rep name"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sales_rep_email">Sales Rep Email</Label>
              <Input
                id="sales_rep_email"
                type="email"
                value={formData.sales_rep_email}
                onChange={(e) => setFormData({ ...formData, sales_rep_email: e.target.value })}
                placeholder="Enter email address"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sales_rep_id">Sales Rep ID (Optional)</Label>
              <Input
                id="sales_rep_id"
                value={formData.sales_rep_id}
                onChange={(e) => setFormData({ ...formData, sales_rep_id: e.target.value })}
                placeholder="User ID from partner instance"
              />
              <p className="text-xs text-muted-foreground">
                The user ID of the sales rep on the partner instance for automatic access
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={addMutation.isPending || updateMutation.isPending}
            >
              {editingAssignment ? "Update" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
