import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Loader2, CheckCircle, XCircle, Trash2, ExternalLink, Copy, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function OutlookConnectionSettings({ embedded }: { embedded?: boolean }) {
  const [connecting, setConnecting] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [previewingCleanup, setPreviewingCleanup] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
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

  const handleGetAuthUrl = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("outlook-email-sync", {
        body: {
          action: "get_auth_url",
          redirect_url: `${window.location.origin}`,
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setAuthUrl(data.authUrl);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setConnecting(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!authUrl) return;
    try {
      await navigator.clipboard.writeText(authUrl);
      toast({ title: "Copied!", description: "Paste this URL in a new browser tab to sign in with Microsoft." });
    } catch {
      toast({ title: "Copy failed", description: "Please select and copy the URL manually.", variant: "destructive" });
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

  const handleRunCleanup = async () => {
    setReconciling(true);
    try {
      const { data, error } = await supabase.functions.invoke("outlook-email-sync", {
        body: { action: "reconcile_claim_assignments" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Outlook cleanup complete",
        description: `Scanned ${data?.scanned || 0} email(s), reassigned ${data?.reassigned || 0}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["email-connections"] });
    } catch (e: any) {
      toast({
        title: "Cleanup failed",
        description: e.message || "Unable to reconcile claim assignments",
        variant: "destructive",
      });
    } finally {
      setReconciling(false);
    }
  };

  const handlePreviewCleanup = async () => {
    setPreviewingCleanup(true);
    try {
      const { data, error } = await supabase.functions.invoke("outlook-email-sync", {
        body: { action: "reconcile_claim_assignments", dry_run: true, preview_limit: 25 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const proposed = Number(data?.proposed_reassignments || 0);
      const scanned = Number(data?.scanned || 0);
      const examples = Array.isArray(data?.proposals) ? data.proposals.slice(0, 3) : [];

      const previewText = examples.length > 0
        ? ` Examples: ${examples.map((row: any) => `${row.from_claim_number || row.from_claim_id} → ${row.to_claim_number || row.to_claim_id}`).join(", ")}.`
        : "";

      toast({
        title: "Cleanup preview ready",
        description: proposed > 0
          ? `Would reassign ${proposed} email(s) out of ${scanned} scanned.${previewText}`
          : `No reassignments suggested across ${scanned} scanned email(s).`,
      });
    } catch (e: any) {
      toast({
        title: "Preview failed",
        description: e.message || "Unable to preview claim reassignment suggestions",
        variant: "destructive",
      });
    } finally {
      setPreviewingCleanup(false);
    }
  };

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
                        <span>{conn.provider === 'outlook_oauth' ? 'Outlook Graph OAuth' : conn.imap_host}</span>
                        {conn.last_sync_at && (
                          <span>• Last synced: {new Date(conn.last_sync_at).toLocaleDateString()}</span>
                        )}
                        {conn.last_sync_stats?.imported !== undefined && (
                          <span>• Imported: {conn.last_sync_stats.imported}</span>
                        )}
                        {conn.last_sync_stats?.reassigned !== undefined && (
                          <span>• Reassigned: {conn.last_sync_stats.reassigned}</span>
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
                      <Badge variant="outline" className="text-xs gap-1 border-green-500/30">
                        <CheckCircle className="h-3 w-3 text-green-700" /> Active
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

          {/* Sign in with Microsoft */}
          <div className="space-y-4">
            {connections && connections.length > 0 && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handlePreviewCleanup}
                  disabled={reconciling || previewingCleanup}
                >
                  {previewingCleanup ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {previewingCleanup ? "Previewing..." : "Preview Claim Cleanup"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleRunCleanup}
                  disabled={reconciling || previewingCleanup}
                >
                  {reconciling ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {reconciling ? "Running cleanup..." : "Run Outlook Claim Cleanup"}
                </Button>
              </div>
            )}
            {!authUrl ? (
              <>
                <Button
                  onClick={handleGetAuthUrl}
                  disabled={connecting}
                  className="w-full"
                  variant="outline"
                >
                  {connecting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  {connecting ? "Generating sign-in link..." : "Sign in with Microsoft"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Uses secure OAuth 2.0 — your password is never stored
                </p>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium">Open this link in a new browser tab to sign in:</p>
                <div className="flex gap-2">
                  <a
                    href={authUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Microsoft Sign-In
                  </a>
                  <Button variant="outline" size="icon" onClick={handleCopyUrl} title="Copy URL">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  After signing in, come back here and click "Check Connection" below.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      queryClient.invalidateQueries({ queryKey: ["email-connections"] });
                      toast({ title: "Checking...", description: "Looking for your Microsoft connection." });
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Check Connection
                  </Button>
                  <Button variant="ghost" onClick={() => setAuthUrl(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </div>
    </Wrapper>
  );
}
