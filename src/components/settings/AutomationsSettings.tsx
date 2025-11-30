import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Plus, Play, Trash2, History } from "lucide-react";

export const AutomationsSettings = () => {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAutomation, setSelectedAutomation] = useState<any>(null);

  const { data: automations, isLoading } = useQuery({
    queryKey: ["automations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: executions } = useQuery({
    queryKey: ["automation-executions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_executions")
        .select("*, automation:automations(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (automation: any) => {
      const { error } = await supabase.from("automations").insert(automation);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success("Automation created successfully");
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success("Automation deleted");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("automations")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
  });

  const manualTriggerMutation = useMutation({
    mutationFn: async (automationId: string) => {
      const { data, error } = await supabase.functions.invoke('automation-webhook', {
        body: { automation_id: automationId }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Automation triggered");
      queryClient.invalidateQueries({ queryKey: ["automation-executions"] });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const automation = {
      name: formData.get("name") as string,
      description: formData.get("description") as string,
      trigger_type: formData.get("trigger_type") as string,
      trigger_config: {},
      actions: [],
      is_active: true,
    };

    createMutation.mutate(automation);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Automations</h2>
          <p className="text-muted-foreground">Create automated workflows for your claims</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Automation
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Create Automation</DialogTitle>
                <DialogDescription>
                  Set up a new automation workflow
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" placeholder="e.g., Create inspection task" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" placeholder="What does this automation do?" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trigger_type">Trigger Type</Label>
                  <Select name="trigger_type" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select trigger" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="status_change">Claim Status Change</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="manual">Manual Trigger</SelectItem>
                      <SelectItem value="webhook">External Webhook</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="automations">
        <TabsList>
          <TabsTrigger value="automations">Automations</TabsTrigger>
          <TabsTrigger value="history">Execution History</TabsTrigger>
        </TabsList>

        <TabsContent value="automations" className="space-y-4">
          {automations?.map((automation) => (
            <Card key={automation.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{automation.name}</CardTitle>
                    <CardDescription>{automation.description}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={automation.is_active}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ id: automation.id, is_active: checked })
                      }
                    />
                    {automation.trigger_type === 'manual' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => manualTriggerMutation.mutate(automation.id)}
                        disabled={!automation.is_active}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteMutation.mutate(automation.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {automation.trigger_type.replace('_', ' ')}
                  </Badge>
                  <Badge variant={automation.is_active ? "default" : "secondary"}>
                    {automation.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {executions?.map((execution: any) => (
            <Card key={execution.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{execution.automation?.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(execution.created_at).toLocaleString()}
                    </div>
                  </div>
                  <Badge
                    variant={
                      execution.status === 'success'
                        ? 'default'
                        : execution.status === 'failed'
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {execution.status}
                  </Badge>
                </div>
                {execution.error_message && (
                  <div className="mt-2 text-sm text-destructive">
                    Error: {execution.error_message}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
};
