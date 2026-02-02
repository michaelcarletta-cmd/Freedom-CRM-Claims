import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  Bot, 
  Zap, 
  AlertTriangle, 
  Shield, 
  Eye, 
  Mail, 
  CheckSquare, 
  TrendingUp,
  History,
  Settings2
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";

interface ClaimAutonomySettingsProps {
  claimId: string;
}

type AutonomyLevel = 'supervised' | 'semi_autonomous' | 'fully_autonomous';

interface ClaimAutomation {
  id: string;
  claim_id: string;
  is_enabled: boolean;
  autonomy_level: AutonomyLevel;
  auto_respond_without_approval: boolean;
  auto_complete_tasks: boolean;
  auto_escalate_urgency: boolean;
  daily_action_limit: number;
  keyword_blockers: string[];
}

interface DarwinActionLog {
  id: string;
  claim_id: string;
  action_type: string;
  action_details: Record<string, any>;
  was_auto_executed: boolean;
  executed_at: string;
  result: string;
  error_message: string | null;
  trigger_source: string;
}

export const ClaimAutonomySettings = ({ claimId }: ClaimAutonomySettingsProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showActionLog, setShowActionLog] = useState(false);

  const { data: automation, isLoading } = useQuery({
    queryKey: ["claim-automation-autonomy", claimId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_automations")
        .select("id, claim_id, is_enabled, autonomy_level, auto_respond_without_approval, auto_complete_tasks, auto_escalate_urgency, daily_action_limit, keyword_blockers")
        .eq("claim_id", claimId)
        .maybeSingle();

      if (error) throw error;
      return data as ClaimAutomation | null;
    },
  });

  const { data: actionLogs } = useQuery({
    queryKey: ["darwin-action-log", claimId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("darwin_action_log")
        .select("*")
        .eq("claim_id", claimId)
        .order("executed_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as DarwinActionLog[];
    },
    enabled: showActionLog,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<ClaimAutomation>) => {
      if (!automation?.id) {
        // Create new automation record with autonomy settings
        const { error } = await supabase
          .from("claim_automations")
          .insert({
            claim_id: claimId,
            is_enabled: true,
            ...updates,
          } as any);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("claim_automations")
          .update(updates as any)
          .eq("id", automation.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claim-automation-autonomy", claimId] });
      toast({
        title: "Settings Updated",
        description: "Autonomy settings have been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update settings",
        variant: "destructive",
      });
    },
  });

  const handleAutonomyLevelChange = (level: AutonomyLevel) => {
    const updates: Partial<ClaimAutomation> = {
      autonomy_level: level,
    };

    // Auto-configure settings based on level
    if (level === 'supervised') {
      updates.auto_respond_without_approval = false;
      updates.auto_complete_tasks = false;
    } else if (level === 'semi_autonomous') {
      updates.auto_respond_without_approval = false;
      updates.auto_complete_tasks = true;
    } else if (level === 'fully_autonomous') {
      updates.auto_respond_without_approval = true;
      updates.auto_complete_tasks = true;
    }

    updateMutation.mutate(updates);
  };

  const getAutonomyBadge = (level: AutonomyLevel) => {
    switch (level) {
      case 'supervised':
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            Supervised
          </Badge>
        );
      case 'semi_autonomous':
        return (
          <Badge className="flex items-center gap-1 bg-amber-500/20 text-amber-500 hover:bg-amber-500/30">
            <Zap className="h-3 w-3" />
            Semi-Autonomous
          </Badge>
        );
      case 'fully_autonomous':
        return (
          <Badge className="flex items-center gap-1 bg-green-500/20 text-green-500 hover:bg-green-500/30">
            <Bot className="h-3 w-3" />
            Fully Autonomous
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const autonomyLevel = automation?.autonomy_level || 'supervised';

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Darwin Autonomy Mode</CardTitle>
              <CardDescription>
                Control how independently Darwin operates on this claim
              </CardDescription>
            </div>
          </div>
          {automation && getAutonomyBadge(autonomyLevel as AutonomyLevel)}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Autonomy Level Selector */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Autonomy Level</Label>
          <Select
            value={autonomyLevel}
            onValueChange={(v) => handleAutonomyLevelChange(v as AutonomyLevel)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="supervised">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  <div>
                    <div className="font-medium">Supervised</div>
                    <div className="text-xs text-muted-foreground">All actions require approval</div>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="semi_autonomous">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  <div>
                    <div className="font-medium">Semi-Autonomous</div>
                    <div className="text-xs text-muted-foreground">Low-risk actions auto-execute</div>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="fully_autonomous">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  <div>
                    <div className="font-medium">Fully Autonomous</div>
                    <div className="text-xs text-muted-foreground">Darwin handles everything</div>
                  </div>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Granular Controls */}
        <div className="space-y-4 pt-4 border-t border-border">
          <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Fine-Tune Actions
          </h4>

          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-primary" />
              <div>
                <Label className="text-sm font-medium">Auto-Send Email Responses</Label>
                <p className="text-xs text-muted-foreground">
                  Send AI-drafted emails without waiting for approval
                </p>
              </div>
            </div>
            <Switch
              checked={automation?.auto_respond_without_approval ?? false}
              onCheckedChange={(v) => updateMutation.mutate({ auto_respond_without_approval: v })}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-3">
              <CheckSquare className="h-5 w-5 text-primary" />
              <div>
                <Label className="text-sm font-medium">Auto-Complete Tasks</Label>
                <p className="text-xs text-muted-foreground">
                  Mark tasks complete when conditions are met
                </p>
              </div>
            </div>
            <Switch
              checked={automation?.auto_complete_tasks ?? false}
              onCheckedChange={(v) => updateMutation.mutate({ auto_complete_tasks: v })}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-primary" />
              <div>
                <Label className="text-sm font-medium">Auto-Escalate Urgency</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically flag urgent items for attention
                </p>
              </div>
            </div>
            <Switch
              checked={automation?.auto_escalate_urgency ?? false}
              onCheckedChange={(v) => updateMutation.mutate({ auto_escalate_urgency: v })}
            />
          </div>
        </div>

        {/* Safety Controls */}
        <div className="space-y-4 pt-4 border-t border-border">
          <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Safety Controls
          </h4>

          <div className="p-3 bg-muted/30 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Daily Action Limit</Label>
                <p className="text-xs text-muted-foreground">
                  Max auto-executed actions per day
                </p>
              </div>
              <Input
                type="number"
                min={1}
                max={100}
                value={automation?.daily_action_limit ?? 10}
                onChange={(e) => updateMutation.mutate({ daily_action_limit: parseInt(e.target.value) || 10 })}
                className="w-20 h-8"
              />
            </div>
          </div>

          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
              <div className="text-sm">
                <span className="font-medium text-amber-500">Keyword Blockers Active</span>
                <p className="text-xs text-muted-foreground mt-1">
                  Darwin will pause and alert you if these words appear: 
                  <span className="font-mono text-xs"> lawsuit, attorney, bad faith, legal action, litigation</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Log Toggle */}
        <div className="pt-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowActionLog(!showActionLog)}
            className="w-full"
          >
            <History className="h-4 w-4 mr-2" />
            {showActionLog ? "Hide" : "View"} Darwin Action Log
          </Button>

          {showActionLog && (
            <ScrollArea className="h-64 mt-4 rounded-lg border border-border">
              <div className="p-3 space-y-2">
                {actionLogs?.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No autonomous actions recorded yet
                  </p>
                ) : (
                  actionLogs?.map((log) => (
                    <div
                      key={log.id}
                      className={`p-2 rounded-lg text-sm ${
                        log.error_message
                          ? "bg-red-500/10 border border-red-500/20"
                          : log.was_auto_executed
                          ? "bg-green-500/10 border border-green-500/20"
                          : "bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium capitalize">
                          {log.action_type.replace(/_/g, " ")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(log.executed_at), "MMM d, h:mm a")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {log.result || log.error_message || "Completed"}
                      </p>
                      {log.was_auto_executed && (
                        <Badge variant="secondary" className="mt-1 text-xs">
                          <Zap className="h-3 w-3 mr-1" />
                          Auto-executed
                        </Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
