import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Loader2, CheckCircle, XCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function OutlookConnectionSettings({ embedded }: { embedded?: boolean }) {
  const [connecting, setConnecting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check URL params for OAuth callback result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('outlook_connected') === 'true') {
      toast({ title: "Outlook connected!", description: "Your Microsoft account has been linked successfully." });
      queryClient.invalidateQueries({ queryKey: ["email-connections"] });
      window.history.replaceState({}, '', window.location.pathname);
    }
    const outlookError = params.get('outlook_error');
    if (outlookError) {
      toast({ title: "Connection failed", description: decodeURIComponent(outlookError), variant: "destructive" });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const { data: connections, isLoading } = useQuery({
    queryKey: ["email-connections"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("email_connections")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleSignIn = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("outlook-email-sync", {
        body: { action: "get_auth_url" },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Open Microsoft OAuth URL directly in new tab to bypass auth-bridge
      const popup = window.open(data.authUrl, '_blank', 'noopener');
      if (!popup) {
        // Fallback: copy URL approach
        try {
          await navigator.clipboard.writeText(data.authUrl);
          toast({ 
            title: "Popup blocked", 
            description: "The Microsoft sign-in URL has been copied to your clipboard. Open a new browser tab and paste it.", 
          });
        } catch {
          toast({ title: "Popup blocked", description: "Please allow popups for this site and try again.", variant: "destructive" });
        }
        setConnecting(false);
        return;
      }

      // Poll for window close & refresh connections
      const pollTimer = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(pollTimer);
            setConnecting(false);
            queryClient.invalidateQueries({ queryKey: ["email-connections"] });
            toast({ title: "Outlook connection", description: "Checking connection status..." });
          }
        } catch {
          // Cross-origin — keep polling
        }
      }, 1000);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setConnecting(false);
    }
  };

  const deleteConnection = useMutation({
    mutationFn: async (connectionId: string) => {
      const { data, error } = await supabase.functions.invoke("outlook-email-sync", {
        body: { action: "delete_connection", connection_id: connectionId },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast({ title: "Connection removed" });
      queryClient.invalidateQueries({ queryKey: ["email-connections"] });
    },
  });

  const Wrapper = embedded ? "div" : Card;

  return (
    <Wrapper className={embedded ? "space-y-4" : undefined}>
      {!embedded && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Outlook / Microsoft 365 Connection
          </CardTitle>
          <CardDescription>
            Connect your Microsoft account so Darwin can see claim-related emails
          </CardDescription>
        </CardHeader>
      )}
      <div>
        <CardContent className={embedded ? "p-0" : undefined}>
          {/* Existing connections */}
          {connections && connections.length > 0 && (
            <div className="space-y-2 mb-6">
              <Label className="text-sm font-medium">Connected Accounts</Label>
              {connections.map((conn: any) => (
                <div key={conn.id} className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{conn.email_address}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{conn.provider === 'outlook_oauth' ? 'Microsoft OAuth' : conn.imap_host}</span>
                        {conn.last_sync_at && (
                          <span>• Last synced: {new Date(conn.last_sync_at).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {conn.last_sync_error ? (
                      <Badge variant="destructive" className="text-xs gap-1">
                        <XCircle className="h-3 w-3" /> Error
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs gap-1 text-green-700 border-green-500/30">
                        <CheckCircle className="h-3 w-3" /> Active
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => deleteConnection.mutate(conn.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sign in with Microsoft button */}
          <div className="space-y-4">
            <Button
              onClick={handleSignIn}
              disabled={connecting}
              className="w-full"
              variant="outline"
            >
              {connecting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              {connecting ? "Redirecting to Microsoft..." : "Sign in with Microsoft"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Uses secure OAuth 2.0 — your password is never stored
            </p>
          </div>
        </CardContent>
      </div>
    </Wrapper>
  );
}
