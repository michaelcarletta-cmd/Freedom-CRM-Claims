import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Shield, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export const AutomationGlobalSettings = () => {
  const queryClient = useQueryClient();
  const [automationsEnabled, setAutomationsEnabled] = useState(true);
  const [excludeStatuses, setExcludeStatuses] = useState<string[]>([]);
  const [excludeOlderThanDays, setExcludeOlderThanDays] = useState<string>("");

  const { data: branding, isLoading: brandingLoading } = useQuery({
    queryKey: ["company-branding-automation-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_branding")
        .select("id, automations_enabled, automation_exclude_statuses, automation_exclude_claims_older_than_days")
        .limit(1)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
  });

  const { data: statuses, isLoading: statusesLoading } = useQuery({
    queryKey: ["claim-statuses-for-automation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_statuses")
        .select("id, name")
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (branding) {
      setAutomationsEnabled(branding.automations_enabled ?? true);
      setExcludeStatuses(branding.automation_exclude_statuses || []);
      setExcludeOlderThanDays(
        branding.automation_exclude_claims_older_than_days?.toString() || ""
      );
    }
  }, [branding]);

  const updateMutation = useMutation({
    mutationFn: async (settings: {
      automations_enabled: boolean;
      automation_exclude_statuses: string[];
      automation_exclude_claims_older_than_days: number | null;
    }) => {
      if (branding?.id) {
        const { error } = await supabase
          .from("company_branding")
          .update(settings)
          .eq("id", branding.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_branding")
          .insert(settings);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-branding-automation-settings"] });
      toast.success("Automation settings saved");
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      automations_enabled: automationsEnabled,
      automation_exclude_statuses: excludeStatuses,
      automation_exclude_claims_older_than_days: excludeOlderThanDays
        ? parseInt(excludeOlderThanDays, 10)
        : null,
    });
  };

  const toggleStatus = (statusName: string) => {
    setExcludeStatuses((prev) =>
      prev.includes(statusName)
        ? prev.filter((s) => s !== statusName)
        : [...prev, statusName]
    );
  };

  if (brandingLoading || statusesLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Automation Global Settings
        </CardTitle>
        <CardDescription>
          Control which claims trigger automations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master Toggle */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-base font-medium">Enable Automations</Label>
            <p className="text-sm text-muted-foreground">
              Master switch to enable or disable all automations globally
            </p>
          </div>
          <Switch
            checked={automationsEnabled}
            onCheckedChange={setAutomationsEnabled}
          />
        </div>

        {/* Exclude Claims Older Than */}
        <div className="space-y-2">
          <Label>Skip automations for claims older than (days)</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="e.g., 90"
              value={excludeOlderThanDays}
              onChange={(e) => setExcludeOlderThanDays(e.target.value)}
              className="w-32"
              min="1"
            />
            <span className="text-sm text-muted-foreground">
              days (leave empty for no limit)
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Claims created before this many days ago will not trigger any automations
          </p>
        </div>

        {/* Exclude Statuses */}
        <div className="space-y-3">
          <Label>Skip automations for claims in these statuses</Label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {statuses?.map((status) => (
              <div
                key={status.id}
                className="flex items-center space-x-2 rounded-md border p-3"
              >
                <Checkbox
                  id={`status-${status.id}`}
                  checked={excludeStatuses.includes(status.name)}
                  onCheckedChange={() => toggleStatus(status.name)}
                />
                <Label
                  htmlFor={`status-${status.id}`}
                  className="cursor-pointer text-sm font-normal"
                >
                  {status.name}
                </Label>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Claims in these statuses will not trigger any scheduled or inactivity automations
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save Settings
          </Button>

          <CleanupTasksButton 
            excludeStatuses={excludeStatuses}
            excludeOlderThanDays={excludeOlderThanDays}
          />
        </div>
      </CardContent>
    </Card>
  );
};

// Separate component for cleanup functionality
const CleanupTasksButton = ({ 
  excludeStatuses, 
  excludeOlderThanDays 
}: { 
  excludeStatuses: string[]; 
  excludeOlderThanDays: string;
}) => {
  const queryClient = useQueryClient();
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const fetchPreviewCount = async () => {
    setIsLoadingPreview(true);
    try {
      // Build query to count tasks that would be affected
      let query = supabase
        .from("tasks")
        .select("id, claim_id, claims!inner(status, created_at)", { count: "exact", head: true })
        .neq("status", "completed");

      // Filter by excluded statuses
      if (excludeStatuses.length > 0) {
        query = query.in("claims.status", excludeStatuses);
      }

      // Filter by age
      if (excludeOlderThanDays) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(excludeOlderThanDays, 10));
        query = query.lt("claims.created_at", cutoffDate.toISOString());
      }

      // If no filters, count tasks from both criteria combined
      if (excludeStatuses.length === 0 && !excludeOlderThanDays) {
        setPreviewCount(0);
        return;
      }

      const { count, error } = await query;
      if (error) throw error;
      setPreviewCount(count || 0);
    } catch (error: any) {
      console.error("Error fetching preview:", error);
      toast.error("Failed to preview affected tasks");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      // Get claim IDs that match the exclusion criteria
      let claimsQuery = supabase.from("claims").select("id, status, created_at");

      const claimIds: string[] = [];

      // Get claims by excluded statuses
      if (excludeStatuses.length > 0) {
        const { data: statusClaims, error: statusError } = await supabase
          .from("claims")
          .select("id")
          .in("status", excludeStatuses);
        if (statusError) throw statusError;
        statusClaims?.forEach(c => claimIds.push(c.id));
      }

      // Get claims older than threshold
      if (excludeOlderThanDays) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(excludeOlderThanDays, 10));
        const { data: oldClaims, error: oldError } = await supabase
          .from("claims")
          .select("id")
          .lt("created_at", cutoffDate.toISOString());
        if (oldError) throw oldError;
        oldClaims?.forEach(c => {
          if (!claimIds.includes(c.id)) claimIds.push(c.id);
        });
      }

      if (claimIds.length === 0) {
        return { deleted: 0 };
      }

      // Delete incomplete tasks for these claims
      const { error: deleteError, count } = await supabase
        .from("tasks")
        .delete({ count: "exact" })
        .in("claim_id", claimIds)
        .neq("status", "completed");

      if (deleteError) throw deleteError;
      return { deleted: count || 0 };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(`Cleaned up ${result.deleted} pending tasks`);
      setPreviewCount(null);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const hasFilters = excludeStatuses.length > 0 || !!excludeOlderThanDays;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button 
          variant="outline" 
          disabled={!hasFilters}
          onClick={fetchPreviewCount}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Clean Up Existing Tasks
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clean Up Pending Tasks</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              This will permanently delete all <strong>incomplete tasks</strong> for claims that match your current exclusion criteria:
            </p>
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              {excludeStatuses.length > 0 && (
                <li>Claims in statuses: {excludeStatuses.join(", ")}</li>
              )}
              {excludeOlderThanDays && (
                <li>Claims older than {excludeOlderThanDays} days</li>
              )}
            </ul>
            {isLoadingPreview ? (
              <p className="mt-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Counting affected tasks...
              </p>
            ) : previewCount !== null ? (
              <p className="mt-3 font-medium">
                {previewCount === 0 
                  ? "No tasks match the current criteria."
                  : `${previewCount} task(s) will be deleted.`}
              </p>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => cleanupMutation.mutate()}
            disabled={cleanupMutation.isPending || previewCount === 0}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {cleanupMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Delete Tasks
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
