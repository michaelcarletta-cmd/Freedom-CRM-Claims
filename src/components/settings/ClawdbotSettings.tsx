import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Bot, Copy, RefreshCw, TestTube, ExternalLink, MessageSquare, Clock, FileText, AlertTriangle, DollarSign } from "lucide-react";

interface ClawdbotConfig {
  id: string;
  webhook_secret: string;
  clawdbot_endpoint: string | null;
  notification_preferences: {
    tasks_due_today: boolean;
    tasks_overdue: boolean;
    new_documents: boolean;
    approaching_deadlines: boolean;
    check_received: boolean;
    inactive_claims_days: number;
  };
  active: boolean;
}

interface MessageLog {
  id: string;
  direction: "inbound" | "outbound";
  message_content: string;
  action_type: string | null;
  created_at: string;
}

export const ClawdbotSettings = () => {
  const { user } = useAuth();
  const [config, setConfig] = useState<ClawdbotConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [messageLogs, setMessageLogs] = useState<MessageLog[]>([]);
  const [endpoint, setEndpoint] = useState("");

  const webhookUrl = `https://tnnzihuszaosnyeyceed.supabase.co/functions/v1/clawdbot-webhook`;

  useEffect(() => {
    if (user) {
      loadConfig();
      loadMessageLogs();
    }
  }, [user]);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from("clawdbot_config")
        .select("*")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setConfig(data as unknown as ClawdbotConfig);
        setEndpoint(data.clawdbot_endpoint || "");
      }
    } catch (error: unknown) {
      console.error("Error loading config:", error);
      toast.error("Failed to load Clawdbot configuration");
    } finally {
      setLoading(false);
    }
  };

  const loadMessageLogs = async () => {
    try {
      const { data, error } = await supabase
        .from("clawdbot_message_log")
        .select("id, direction, message_content, action_type, created_at")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setMessageLogs((data || []) as MessageLog[]);
    } catch (error) {
      console.error("Error loading message logs:", error);
    }
  };

  const generateSecret = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, "0")).join("");
  };

  const handleSetup = async () => {
    if (!user) return;
    setSaving(true);

    try {
      const newSecret = generateSecret();
      
      const { data, error } = await supabase
        .from("clawdbot_config")
        .insert({
          user_id: user.id,
          webhook_secret: newSecret,
          active: true,
          notification_preferences: {
            tasks_due_today: true,
            tasks_overdue: true,
            new_documents: true,
            approaching_deadlines: true,
            check_received: true,
            inactive_claims_days: 7,
          },
        })
        .select()
        .single();

      if (error) throw error;
      
      setConfig(data as unknown as ClawdbotConfig);
      toast.success("Clawdbot integration configured!");
    } catch (error: unknown) {
      console.error("Error setting up Clawdbot:", error);
      toast.error("Failed to set up Clawdbot");
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateSecret = async () => {
    if (!config) return;
    setSaving(true);

    try {
      const newSecret = generateSecret();
      
      const { error } = await supabase
        .from("clawdbot_config")
        .update({ webhook_secret: newSecret })
        .eq("id", config.id);

      if (error) throw error;
      
      setConfig({ ...config, webhook_secret: newSecret });
      toast.success("Secret regenerated! Update your Clawdbot configuration.");
    } catch (error) {
      console.error("Error regenerating secret:", error);
      toast.error("Failed to regenerate secret");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEndpoint = async () => {
    if (!config) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from("clawdbot_config")
        .update({ clawdbot_endpoint: endpoint || null })
        .eq("id", config.id);

      if (error) throw error;
      
      setConfig({ ...config, clawdbot_endpoint: endpoint || null });
      toast.success("Endpoint saved!");
    } catch (error) {
      console.error("Error saving endpoint:", error);
      toast.error("Failed to save endpoint");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!config) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from("clawdbot_config")
        .update({ active: !config.active })
        .eq("id", config.id);

      if (error) throw error;
      
      setConfig({ ...config, active: !config.active });
      toast.success(config.active ? "Clawdbot disabled" : "Clawdbot enabled");
    } catch (error) {
      console.error("Error toggling active:", error);
      toast.error("Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePreference = async (key: string, value: boolean | number) => {
    if (!config) return;

    const newPrefs = { ...config.notification_preferences, [key]: value };

    try {
      const { error } = await supabase
        .from("clawdbot_config")
        .update({ notification_preferences: newPrefs })
        .eq("id", config.id);

      if (error) throw error;
      
      setConfig({ ...config, notification_preferences: newPrefs });
    } catch (error) {
      console.error("Error updating preference:", error);
      toast.error("Failed to update preference");
    }
  };

  const handleTestConnection = async () => {
    if (!config?.clawdbot_endpoint) {
      toast.error("Please set your Clawdbot endpoint first");
      return;
    }
    
    setTesting(true);
    try {
      const response = await fetch(config.clawdbot_endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Clawdbot-Secret": config.webhook_secret,
        },
        body: JSON.stringify({
          type: "test",
          message: "🔔 Test notification from Freedom Claims!",
        }),
      });

      if (response.ok) {
        toast.success("Test notification sent!");
      } else {
        toast.error(`Connection failed: ${response.status}`);
      }
    } catch (error) {
      console.error("Test connection error:", error);
      toast.error("Failed to connect to Clawdbot endpoint");
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  if (!config) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Set Up Clawdbot
            </CardTitle>
            <CardDescription>
              Manage your claims via WhatsApp, Telegram, or any chat app using Clawdbot AI assistant.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4 space-y-2">
              <h4 className="font-medium">What is Clawdbot?</h4>
              <p className="text-sm text-muted-foreground">
                Clawdbot is a self-hosted AI agent that connects to your messaging apps. Once configured, 
                you can lookup claims, create tasks, draft emails, and receive notifications - all from 
                your phone's messaging app.
              </p>
            </div>
            
            <Button onClick={handleSetup} disabled={saving}>
              {saving ? "Setting up..." : "Enable Clawdbot Integration"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <CardTitle>Clawdbot Integration</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={config.active ? "default" : "secondary"}>
                {config.active ? "Active" : "Disabled"}
              </Badge>
              <Switch
                checked={config.active}
                onCheckedChange={handleToggleActive}
                disabled={saving}
              />
            </div>
          </div>
          <CardDescription>
            Manage claims via WhatsApp, Telegram, or any messaging app.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Webhook Configuration</CardTitle>
          <CardDescription>
            Use these details to configure Clawdbot on your Mac Mini.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookUrl, "Webhook URL")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Secret Key</Label>
            <div className="flex gap-2">
              <Input 
                type="password" 
                value={config.webhook_secret} 
                readOnly 
                className="font-mono text-sm"
              />
              <Button variant="outline" size="icon" onClick={() => copyToClipboard(config.webhook_secret, "Secret key")}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={handleRegenerateSecret} disabled={saving}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add this as the X-Clawdbot-Secret header in your Clawdbot configuration.
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Your Clawdbot Endpoint (for notifications)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="https://your-clawdbot-server.local/webhook"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
              />
              <Button onClick={handleSaveEndpoint} disabled={saving}>
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter your Clawdbot's incoming webhook URL to receive proactive notifications.
            </p>
          </div>

          {config.clawdbot_endpoint && (
            <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
              <TestTube className="h-4 w-4 mr-2" />
              {testing ? "Testing..." : "Test Connection"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Notification Preferences</CardTitle>
          <CardDescription>
            Choose which notifications to receive via Clawdbot.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label>Tasks Due Today</Label>
                <p className="text-xs text-muted-foreground">Daily reminder of tasks due</p>
              </div>
            </div>
            <Switch
              checked={config.notification_preferences.tasks_due_today}
              onCheckedChange={(v) => handleUpdatePreference("tasks_due_today", v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label>Overdue Tasks</Label>
                <p className="text-xs text-muted-foreground">Alert when tasks become overdue</p>
              </div>
            </div>
            <Switch
              checked={config.notification_preferences.tasks_overdue}
              onCheckedChange={(v) => handleUpdatePreference("tasks_overdue", v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label>New Documents</Label>
                <p className="text-xs text-muted-foreground">When documents are uploaded to claims</p>
              </div>
            </div>
            <Switch
              checked={config.notification_preferences.new_documents}
              onCheckedChange={(v) => handleUpdatePreference("new_documents", v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label>Approaching Deadlines</Label>
                <p className="text-xs text-muted-foreground">Statutes and response deadline reminders</p>
              </div>
            </div>
            <Switch
              checked={config.notification_preferences.approaching_deadlines}
              onCheckedChange={(v) => handleUpdatePreference("approaching_deadlines", v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label>Check Payments Received</Label>
                <p className="text-xs text-muted-foreground">When insurance payments are logged</p>
              </div>
            </div>
            <Switch
              checked={config.notification_preferences.check_received}
              onCheckedChange={(v) => handleUpdatePreference("check_received", v)}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Inactive Claims Alert (days)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                max="30"
                value={config.notification_preferences.inactive_claims_days}
                onChange={(e) => handleUpdatePreference("inactive_claims_days", parseInt(e.target.value) || 0)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                Set to 0 to disable
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Message History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Recent Messages</CardTitle>
              <CardDescription>Your Clawdbot conversation history</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={loadMessageLogs}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {messageLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No messages yet. Start chatting with Clawdbot!</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {messageLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-3 rounded-lg ${
                      log.direction === "inbound"
                        ? "bg-primary/10 ml-8"
                        : "bg-muted mr-8"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className="text-xs">
                        {log.direction === "inbound" ? "You" : "Clawdbot"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{log.message_content}</p>
                    {log.action_type && (
                      <Badge variant="secondary" className="mt-1 text-xs">
                        {log.action_type}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Setup Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            Clawdbot Setup Instructions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium">Step 1: Install Clawdbot</h4>
            <p className="text-sm text-muted-foreground">
              Follow the instructions at{" "}
              <a href="https://clawd.bot/" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                clawd.bot
              </a>{" "}
              to set up Clawdbot on your Mac Mini.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">Step 2: Add Freedom Claims Tool</h4>
            <p className="text-sm text-muted-foreground">
              Add a new tool in Clawdbot with the webhook URL and secret from above.
            </p>
            <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
{`Tool: Freedom Claims
Description: Manage insurance claims, tasks, and communications
Endpoint: ${webhookUrl}
Headers:
  - X-Clawdbot-Secret: [your-secret-from-above]`}
            </pre>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">Step 3: Test Commands</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>"What claims are in pending status?"</li>
              <li>"Create a task to follow up on the Johnson claim"</li>
              <li>"Draft a supplement request for claim 2024-001"</li>
              <li>"What tasks do I have today?"</li>
              <li>"Give me a weekly summary"</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
