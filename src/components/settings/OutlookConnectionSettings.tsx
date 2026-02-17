import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Loader2, CheckCircle, XCircle, Trash2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function OutlookConnectionSettings({ embedded }: { embedded?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [imapHost, setImapHost] = useState("outlook.office365.com");
  const [imapPort, setImapPort] = useState("993");
  const [testing, setTesting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const testConnection = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("outlook-email-sync", {
        body: {
          action: "test_connection",
          email_address: email,
          password,
          imap_host: imapHost,
          imap_port: parseInt(imapPort),
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      toast({ title: "Connection successful!", description: `Found ${data.email_count} emails in your inbox.` });
      return true;
    } catch (e: any) {
      toast({ title: "Connection failed", description: e.message, variant: "destructive" });
      return false;
    } finally {
      setTesting(false);
    }
  };

  const saveConnection = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("outlook-email-sync", {
        body: {
          action: "save_connection",
          email_address: email,
          password,
          imap_host: imapHost,
          imap_port: parseInt(imapPort),
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Outlook connected!", description: "Your email account has been linked." });
      setEmail("");
      setPassword("");
      queryClient.invalidateQueries({ queryKey: ["email-connections"] });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

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

  const handleTestAndSave = async () => {
    const success = await testConnection();
    if (success) {
      saveConnection.mutate();
    }
  };

  const Wrapper = embedded ? "div" : Card;

  return (
    <Wrapper className={embedded ? "space-y-4" : undefined}>
      {!embedded && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Outlook / Email Connection
          </CardTitle>
          <CardDescription>
            Connect your Outlook or email account so Darwin can see claim-related emails
          </CardDescription>
        </CardHeader>
      )}
      <div className={embedded ? "" : ""}>
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
                        <span>{conn.imap_host}</span>
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

          {/* Add new connection */}
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-700">
                For Outlook/Microsoft 365, you'll need an <strong>App Password</strong> (not your regular password).
                Go to <strong>account.microsoft.com → Security → App Passwords</strong> to generate one.
                For Gmail, enable 2FA and create an App Password at <strong>myaccount.google.com/apppasswords</strong>.
              </p>
            </div>

            <div className="grid gap-3">
              <div>
                <Label htmlFor="email-address">Email Address</Label>
                <Input
                  id="email-address"
                  type="email"
                  placeholder="you@outlook.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="app-password">App Password</Label>
                <Input
                  id="app-password"
                  type="password"
                  placeholder="Your app password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="imap-host">IMAP Host</Label>
                  <Input
                    id="imap-host"
                    value={imapHost}
                    onChange={(e) => setImapHost(e.target.value)}
                    placeholder="outlook.office365.com"
                  />
                </div>
                <div>
                  <Label htmlFor="imap-port">IMAP Port</Label>
                  <Input
                    id="imap-port"
                    value={imapPort}
                    onChange={(e) => setImapPort(e.target.value)}
                    placeholder="993"
                  />
                </div>
              </div>
            </div>

            <Button
              onClick={handleTestAndSave}
              disabled={!email || !password || testing || saveConnection.isPending}
              className="w-full"
            >
              {testing || saveConnection.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              {testing ? "Testing Connection..." : saveConnection.isPending ? "Saving..." : "Test & Connect"}
            </Button>
          </div>
        </CardContent>
      </div>
    </Wrapper>
  );
}
