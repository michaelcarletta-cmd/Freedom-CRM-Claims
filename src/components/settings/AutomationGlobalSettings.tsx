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
import { Loader2, Settings, Shield } from "lucide-react";

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

        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Save Settings
        </Button>
      </CardContent>
    </Card>
  );
};
