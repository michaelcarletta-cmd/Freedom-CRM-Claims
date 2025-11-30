import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Edit } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface TaskAutomation {
  id: string;
  title: string;
  description: string | null;
  trigger_type: "on_claim_creation" | "on_status_change";
  trigger_status: string | null;
  priority: "low" | "medium" | "high";
  due_date_offset: number;
  is_active: boolean;
}

interface ClaimStatus {
  id: string;
  name: string;
}

export function TaskAutomationsSettings() {
  const [automations, setAutomations] = useState<TaskAutomation[]>([]);
  const [statuses, setStatuses] = useState<ClaimStatus[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<TaskAutomation | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    trigger_type: "on_claim_creation" as "on_claim_creation" | "on_status_change",
    trigger_status: "",
    priority: "medium" as "low" | "medium" | "high",
    due_date_offset: 0,
    is_active: true,
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchAutomations();
    fetchStatuses();
  }, []);

  const fetchAutomations = async () => {
    try {
      const { data, error } = await supabase
        .from("task_automations")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAutomations((data || []) as TaskAutomation[]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchStatuses = async () => {
    try {
      const { data, error } = await supabase
        .from("claim_statuses")
        .select("id, name")
        .eq("is_active", true)
        .order("display_order");

      if (error) throw error;
      setStatuses(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      toast({
        title: "Error",
        description: "Task title is required",
        variant: "destructive",
      });
      return;
    }

    try {
      const payload = {
        ...formData,
        trigger_status: formData.trigger_type === "on_status_change" ? formData.trigger_status : null,
      };

      if (editingAutomation) {
        const { error } = await supabase
          .from("task_automations")
          .update(payload)
          .eq("id", editingAutomation.id);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Task automation updated successfully",
        });
      } else {
        const { error } = await supabase
          .from("task_automations")
          .insert(payload);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Task automation created successfully",
        });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchAutomations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEdit = (automation: TaskAutomation) => {
    setEditingAutomation(automation);
    setFormData({
      title: automation.title,
      description: automation.description || "",
      trigger_type: automation.trigger_type,
      trigger_status: automation.trigger_status || "",
      priority: automation.priority,
      due_date_offset: automation.due_date_offset,
      is_active: automation.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("task_automations")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Task automation deleted successfully",
      });

      fetchAutomations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from("task_automations")
        .update({ is_active: !currentActive })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Task automation ${!currentActive ? "activated" : "deactivated"}`,
      });

      fetchAutomations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setEditingAutomation(null);
    setFormData({
      title: "",
      description: "",
      trigger_type: "on_claim_creation",
      trigger_status: "",
      priority: "medium",
      due_date_offset: 0,
      is_active: true,
    });
  };

  const getTriggerDisplay = (automation: TaskAutomation) => {
    if (automation.trigger_type === "on_claim_creation") {
      return "When claim is created";
    }
    return `When status changes to: ${automation.trigger_status}`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Task Automations</CardTitle>
            <CardDescription>
              Automatically create tasks when claims are created or when they enter specific statuses
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Automation
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingAutomation ? "Edit Task Automation" : "Create Task Automation"}
                </DialogTitle>
                <DialogDescription>
                  Define a task that will be automatically created based on claim events
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Task Title*</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g., Initial claim review"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Task Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Optional task details..."
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="trigger_type">Trigger Type</Label>
                    <Select
                      value={formData.trigger_type}
                      onValueChange={(value: "on_claim_creation" | "on_status_change") =>
                        setFormData({ ...formData, trigger_type: value })
                      }
                    >
                      <SelectTrigger id="trigger_type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="on_claim_creation">When claim is created</SelectItem>
                        <SelectItem value="on_status_change">When status changes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.trigger_type === "on_status_change" && (
                    <div className="space-y-2">
                      <Label htmlFor="trigger_status">Target Status</Label>
                      <Select
                        value={formData.trigger_status}
                        onValueChange={(value) => setFormData({ ...formData, trigger_status: value })}
                      >
                        <SelectTrigger id="trigger_status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          {statuses.map((status) => (
                            <SelectItem key={status.id} value={status.name}>
                              {status.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value: "low" | "medium" | "high") =>
                        setFormData({ ...formData, priority: value })
                      }
                    >
                      <SelectTrigger id="priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="due_date_offset">Due Date (days from trigger)</Label>
                    <Input
                      id="due_date_offset"
                      type="number"
                      value={formData.due_date_offset}
                      onChange={(e) =>
                        setFormData({ ...formData, due_date_offset: parseInt(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="is_active">Active</Label>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit}>
                  {editingAutomation ? "Update" : "Create"} Automation
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {automations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No task automations configured. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              automations.map((automation) => (
                <TableRow key={automation.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{automation.title}</div>
                      {automation.description && (
                        <div className="text-sm text-muted-foreground">{automation.description}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{getTriggerDisplay(automation)}</TableCell>
                  <TableCell>
                    <span className="capitalize">{automation.priority}</span>
                  </TableCell>
                  <TableCell>
                    {automation.due_date_offset === 0
                      ? "Same day"
                      : `${automation.due_date_offset} day${automation.due_date_offset !== 1 ? "s" : ""}`}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={automation.is_active}
                      onCheckedChange={() => toggleActive(automation.id, automation.is_active)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(automation)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(automation.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
