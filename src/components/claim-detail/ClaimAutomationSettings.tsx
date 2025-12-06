import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Bot, Mail, MessageSquare, FileText, Sparkles, Send } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ClaimAutomationSettingsProps {
  claimId: string;
}

interface AutomationSettings {
  auto_respond_emails: boolean;
  auto_update_notes: boolean;
  auto_send_sms: boolean;
}

export const ClaimAutomationSettings = ({ claimId }: ClaimAutomationSettingsProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [smsRecipient, setSmsRecipient] = useState("policyholder");

  const { data: automation, isLoading } = useQuery({
    queryKey: ["claim-automation", claimId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_automations")
        .select("*")
        .eq("claim_id", claimId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("claim_automations")
        .insert({
          claim_id: claimId,
          is_enabled: true,
          settings: {
            auto_respond_emails: true,
            auto_update_notes: true,
            auto_send_sms: false,
          },
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claim-automation", claimId] });
      toast({
        title: "AI Automation Enabled",
        description: "This claim now has AI-powered automation active.",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: { is_enabled?: boolean; settings?: Record<string, boolean> }) => {
      const { error } = await supabase
        .from("claim_automations")
        .update(updates)
        .eq("id", automation?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claim-automation", claimId] });
    },
  });

  const handleToggleEnabled = () => {
    if (automation) {
      updateMutation.mutate({ is_enabled: !automation.is_enabled });
    }
  };

  const draftSmsMutation = useMutation({
    mutationFn: async (recipientType: string) => {
      const { data, error } = await supabase.functions.invoke("process-claim-ai-action", {
        body: {
          action: "draft_sms",
          claimId,
          recipientType,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "SMS Draft Created",
        description: "Check the Inbox > AI Approvals tab to review and send.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to draft SMS",
        variant: "destructive",
      });
    },
  });

  const handleSettingChange = (key: keyof AutomationSettings, value: boolean) => {
    if (automation) {
      const currentSettings = (automation.settings || {}) as Record<string, boolean>;
      updateMutation.mutate({
        settings: {
          ...currentSettings,
          [key]: value,
        },
      });
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

  const settings = automation?.settings as unknown as AutomationSettings | undefined;

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">AI Claim Automation</CardTitle>
            <CardDescription>
              Enable AI-powered automation for this specific claim
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!automation ? (
          <div className="text-center py-6">
            <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium text-foreground mb-2">Enable AI Automation</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Let AI automatically process inbound emails, draft responses for your approval,
              and keep notes updated for this claim.
            </p>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="bg-primary hover:bg-primary/90"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Bot className="h-4 w-4 mr-2" />
              )}
              Enable AI Automation
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch
                  checked={automation.is_enabled}
                  onCheckedChange={handleToggleEnabled}
                  id="automation-enabled"
                />
                <Label htmlFor="automation-enabled" className="text-base font-medium">
                  {automation.is_enabled ? "Automation Active" : "Automation Paused"}
                </Label>
              </div>
              <span
                className={`px-2 py-1 text-xs rounded ${
                  automation.is_enabled
                    ? "bg-green-500/20 text-green-500"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {automation.is_enabled ? "Active" : "Paused"}
              </span>
            </div>

            {automation.is_enabled && (
              <div className="space-y-4 pt-4 border-t border-border">
                <h4 className="text-sm font-medium text-muted-foreground">Automation Actions</h4>

                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-primary" />
                    <div>
                      <Label className="text-sm font-medium">Auto-Draft Email Responses</Label>
                      <p className="text-xs text-muted-foreground">
                        AI drafts replies to inbound emails for your approval
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings?.auto_respond_emails ?? true}
                    onCheckedChange={(v) => handleSettingChange("auto_respond_emails", v)}
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary" />
                    <div>
                      <Label className="text-sm font-medium">Auto-Update Notes</Label>
                      <p className="text-xs text-muted-foreground">
                        AI logs observations and summaries to claim activity
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings?.auto_update_notes ?? true}
                    onCheckedChange={(v) => handleSettingChange("auto_update_notes", v)}
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    <div>
                      <Label className="text-sm font-medium">SMS Notifications</Label>
                      <p className="text-xs text-muted-foreground">
                        AI can send SMS updates (requires approval)
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings?.auto_send_sms ?? false}
                    onCheckedChange={(v) => handleSettingChange("auto_send_sms", v)}
                  />
                </div>

                <div className="pt-4 border-t border-border">
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">Manual AI Actions</h4>
                  <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <Label className="text-sm font-medium">Draft SMS with AI</Label>
                      <p className="text-xs text-muted-foreground">
                        Generate an SMS draft for approval
                      </p>
                    </div>
                    <Select value={smsRecipient} onValueChange={setSmsRecipient}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="policyholder">Policyholder</SelectItem>
                        <SelectItem value="adjuster">Adjuster</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => draftSmsMutation.mutate(smsRecipient)}
                      disabled={draftSmsMutation.isPending}
                    >
                      {draftSmsMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
