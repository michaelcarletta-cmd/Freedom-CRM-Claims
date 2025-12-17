import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, UserPlus, Trash2, MessageSquare, FileText, Send, Link2, RefreshCw, Globe } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";

export function WorkspaceDetail() {
  const { workspaceId } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showLinkInstanceDialog, setShowLinkInstanceDialog] = useState(false);
  const [inviteOrgSlug, setInviteOrgSlug] = useState("");
  const [inviteRole, setInviteRole] = useState("collaborator");
  const [isInviting, setIsInviting] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [externalInstanceUrl, setExternalInstanceUrl] = useState("");
  const [externalInstanceName, setExternalInstanceName] = useState("");
  const [syncSecret, setSyncSecret] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Get user's organization
  const { data: userOrg } = useQuery({
    queryKey: ["user-organization"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data } = await supabase
        .from("org_members")
        .select("*, orgs (*)")
        .eq("user_id", user.id)
        .maybeSingle();

      return data;
    },
  });

  // Get workspace details
  const { data: workspace, isLoading } = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;

      const { data } = await supabase
        .from("workspaces")
        .select(`
          *,
          owner_org:orgs!owner_org_id (name, slug)
        `)
        .eq("id", workspaceId)
        .single();

      return data;
    },
    enabled: !!workspaceId,
  });

  // Get workspace members
  const { data: members } = useQuery({
    queryKey: ["workspace-members", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];

      const { data } = await supabase
        .from("workspace_members")
        .select(`
          *,
          orgs (name, slug)
        `)
        .eq("workspace_id", workspaceId)
        .eq("status", "active");

      return data || [];
    },
    enabled: !!workspaceId,
  });

  // Get claims in workspace
  const { data: claims } = useQuery({
    queryKey: ["workspace-claims", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];

      const { data } = await supabase
        .from("claims")
        .select("id, claim_number, policyholder_name, status, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      return data || [];
    },
    enabled: !!workspaceId,
  });

  // Get messages/threads
  const { data: threads } = useQuery({
    queryKey: ["workspace-threads", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];

      const { data } = await supabase
        .from("workspace_threads")
        .select(`
          *,
          workspace_messages (
            id,
            body,
            created_at,
            sender_id,
            profiles:sender_id (full_name, email)
          )
        `)
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false });

      return data || [];
    },
    enabled: !!workspaceId,
  });

  // Get linked external instances
  const { data: linkedInstances } = useQuery({
    queryKey: ["linked-workspaces", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];

      const { data } = await supabase
        .from("linked_workspaces")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      return data || [];
    },
    enabled: !!workspaceId,
  });

  const isOwner = workspace?.owner_org_id === userOrg?.org_id;

  const handleInviteOrg = async () => {
    if (!inviteOrgSlug.trim() || !workspaceId) return;

    setIsInviting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const slugToSearch = inviteOrgSlug.trim().toLowerCase();
      console.log("Searching for org with slug:", slugToSearch);

      // Find org by slug
      const { data: targetOrg, error: orgError } = await supabase
        .from("orgs")
        .select("id, name")
        .eq("slug", slugToSearch)
        .maybeSingle();

      console.log("Org lookup result:", { targetOrg, orgError });

      if (orgError) {
        toast({
          title: "Error looking up organization",
          description: orgError.message,
          variant: "destructive",
        });
        return;
      }

      if (!targetOrg) {
        toast({
          title: "Organization not found",
          description: `No organization found with slug "${slugToSearch}"`,
          variant: "destructive",
        });
        return;
      }

      // Check if already a member
      const { data: existing } = await supabase
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("org_id", targetOrg.id)
        .maybeSingle();

      if (existing) {
        toast({
          title: "Already a member",
          description: `${targetOrg.name} is already a member of this workspace`,
          variant: "destructive",
        });
        return;
      }

      // Create invite
      const { error: inviteError } = await supabase
        .from("workspace_invites")
        .insert({
          workspace_id: workspaceId,
          invited_org_id: targetOrg.id,
          role: inviteRole,
          invited_by: user.id,
        });

      if (inviteError) throw inviteError;

      toast({
        title: "Invitation sent",
        description: `Invitation sent to ${targetOrg.name}`,
      });

      setShowInviteDialog(false);
      setInviteOrgSlug("");
      setInviteRole("collaborator");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      const { error } = await supabase
        .from("workspace_members")
        .update({ status: "removed" })
        .eq("id", memberId);

      if (error) throw error;

      toast({
        title: "Member removed",
      });
      queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !workspaceId) return;

    setIsSendingMessage(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Find or create general thread
      let { data: thread } = await supabase
        .from("workspace_threads")
        .select("id")
        .eq("workspace_id", workspaceId)
        .is("claim_id", null)
        .maybeSingle();

      if (!thread) {
        const { data: newThread, error: threadError } = await supabase
          .from("workspace_threads")
          .insert({
            workspace_id: workspaceId,
            subject: "General",
            created_by: user.id,
          })
          .select()
          .single();

        if (threadError) throw threadError;
        thread = newThread;
      }

      // Add message
      const { error: msgError } = await supabase
        .from("workspace_messages")
        .insert({
          thread_id: thread.id,
          sender_id: user.id,
          body: newMessage.trim(),
        });

      if (msgError) throw msgError;

      // Update thread updated_at
      await supabase
        .from("workspace_threads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", thread.id);

      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["workspace-threads"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleLinkExternalInstance = async () => {
    if (!externalInstanceUrl.trim() || !externalInstanceName.trim() || !syncSecret.trim() || !workspaceId) return;

    setIsLinking(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if already linked
      const { data: existing } = await supabase
        .from("linked_workspaces")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("external_instance_url", externalInstanceUrl.trim())
        .maybeSingle();

      if (existing) {
        toast({
          title: "Already linked",
          description: "This instance is already linked to this workspace",
          variant: "destructive",
        });
        return;
      }

      // Create link record
      const { error } = await supabase
        .from("linked_workspaces")
        .insert({
          workspace_id: workspaceId,
          external_instance_url: externalInstanceUrl.trim(),
          instance_name: externalInstanceName.trim(),
          sync_secret: syncSecret.trim(),
          sync_status: "active",
          created_by: user.id,
        });

      if (error) throw error;

      toast({
        title: "Instance linked",
        description: `${externalInstanceName} has been linked to this workspace`,
      });

      setShowLinkInstanceDialog(false);
      setExternalInstanceUrl("");
      setExternalInstanceName("");
      setSyncSecret("");
      queryClient.invalidateQueries({ queryKey: ["linked-workspaces"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLinking(false);
    }
  };

  const handleSyncToInstance = async (linkedWorkspace: any) => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("workspace-sync", {
        body: {
          action: "sync_claims",
          workspace_id: workspaceId,
          target_instance_url: linkedWorkspace.external_instance_url,
          sync_secret: linkedWorkspace.sync_secret,
        },
      });

      if (error) throw error;

      toast({
        title: "Sync complete",
        description: `Claims synced to ${linkedWorkspace.instance_name}`,
      });

      queryClient.invalidateQueries({ queryKey: ["linked-workspaces"] });
    } catch (error: any) {
      toast({
        title: "Sync failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRemoveLinkedInstance = async (linkId: string) => {
    try {
      const { error } = await supabase
        .from("linked_workspaces")
        .delete()
        .eq("id", linkId);

      if (error) throw error;

      toast({
        title: "Instance unlinked",
      });
      queryClient.invalidateQueries({ queryKey: ["linked-workspaces"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (!workspace) {
    return <div className="text-center py-8">Workspace not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{workspace.name}</h1>
          <p className="text-muted-foreground">
            Owned by {(workspace.owner_org as any)?.name}
          </p>
        </div>
        {isOwner && (
          <div className="flex gap-2">
            <Dialog open={showLinkInstanceDialog} onOpenChange={setShowLinkInstanceDialog}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Link2 className="h-4 w-4 mr-2" />
                  Link External Instance
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Link External Instance</DialogTitle>
                  <DialogDescription>
                    Connect an external Freedom Claims instance to sync workspace claims
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Instance Name</Label>
                    <Input
                      placeholder="e.g., Condition One Commercial"
                      value={externalInstanceName}
                      onChange={(e) => setExternalInstanceName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Instance URL</Label>
                    <Input
                      placeholder="https://xxx.supabase.co"
                      value={externalInstanceUrl}
                      onChange={(e) => setExternalInstanceUrl(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      The Supabase URL of the external instance
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Sync Secret</Label>
                    <Input
                      type="password"
                      placeholder="Shared secret for authentication"
                      value={syncSecret}
                      onChange={(e) => setSyncSecret(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Must match the CLAIM_SYNC_SECRET on the external instance
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowLinkInstanceDialog(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleLinkExternalInstance} 
                    disabled={isLinking || !externalInstanceUrl.trim() || !externalInstanceName.trim() || !syncSecret.trim()}
                  >
                    {isLinking ? "Linking..." : "Link Instance"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite Organization
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite Organization</DialogTitle>
                  <DialogDescription>
                    Invite another company to collaborate in this workspace
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Organization Slug</Label>
                    <Input
                      placeholder="e.g., condition-one"
                      value={inviteOrgSlug}
                      onChange={(e) => setInviteOrgSlug(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      The unique identifier of the organization
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="collaborator">Collaborator</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleInviteOrg} disabled={isInviting}>
                    {isInviting ? "Sending..." : "Send Invitation"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <Tabs defaultValue="claims">
        <TabsList>
          <TabsTrigger value="claims">
            <FileText className="h-4 w-4 mr-2" />
            Claims
          </TabsTrigger>
          <TabsTrigger value="messages">
            <MessageSquare className="h-4 w-4 mr-2" />
            Messages
          </TabsTrigger>
          <TabsTrigger value="members">
            <Building2 className="h-4 w-4 mr-2" />
            Members
          </TabsTrigger>
          <TabsTrigger value="linked">
            <Globe className="h-4 w-4 mr-2" />
            Linked Instances
          </TabsTrigger>
        </TabsList>

        <TabsContent value="claims" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Shared Claims</CardTitle>
              <CardDescription>
                Claims shared in this workspace
              </CardDescription>
            </CardHeader>
            <CardContent>
              {claims && claims.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Claim #</TableHead>
                      <TableHead>Policyholder</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {claims.map((claim: any) => (
                      <TableRow
                        key={claim.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/claims/${claim.id}`)}
                      >
                        <TableCell className="font-medium">
                          {claim.claim_number || "—"}
                        </TableCell>
                        <TableCell>{claim.policyholder_name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{claim.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {format(new Date(claim.created_at), "MMM d, yyyy")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No claims in this workspace yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Workspace Messages</CardTitle>
              <CardDescription>
                Collaborate with partner organizations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-h-96 overflow-y-auto space-y-4">
                {threads?.map((thread: any) =>
                  thread.workspace_messages?.map((msg: any) => (
                    <div key={msg.id} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">
                          {msg.profiles?.full_name || msg.profiles?.email}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(msg.created_at), "MMM d, h:mm a")}
                        </span>
                      </div>
                      <p className="text-sm">{msg.body}</p>
                    </div>
                  ))
                )}
                {(!threads || threads.length === 0 || !threads.some((t: any) => t.workspace_messages?.length)) && (
                  <div className="text-center py-8 text-muted-foreground">
                    No messages yet. Start the conversation!
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Textarea
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="resize-none"
                  rows={2}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={isSendingMessage || !newMessage.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Member Organizations</CardTitle>
              <CardDescription>
                Companies collaborating in this workspace
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    {isOwner && <TableHead className="w-12"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members?.map((member: any) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {member.orgs?.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.role === "owner" ? "default" : "secondary"}>
                          {member.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{member.status}</Badge>
                      </TableCell>
                      {isOwner && (
                        <TableCell>
                          {member.role !== "owner" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveMember(member.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="linked" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Linked External Instances</CardTitle>
              <CardDescription>
                External Freedom Claims instances that sync with this workspace
              </CardDescription>
            </CardHeader>
            <CardContent>
              {linkedInstances && linkedInstances.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Instance</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Synced</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linkedInstances.map((linked: any) => (
                      <TableRow key={linked.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-muted-foreground" />
                            {linked.instance_name}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {linked.external_instance_url}
                        </TableCell>
                        <TableCell>
                          <Badge variant={linked.sync_status === "active" ? "default" : "secondary"}>
                            {linked.sync_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {linked.last_synced_at
                            ? format(new Date(linked.last_synced_at), "MMM d, h:mm a")
                            : "Never"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleSyncToInstance(linked)}
                              disabled={isSyncing}
                              title="Sync claims to this instance"
                            >
                              <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                            </Button>
                            {isOwner && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveLinkedInstance(linked.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No external instances linked yet. Click "Link External Instance" to connect one.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
