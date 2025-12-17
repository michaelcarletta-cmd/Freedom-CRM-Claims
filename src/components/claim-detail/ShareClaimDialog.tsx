import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Folder, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ShareClaimDialogProps {
  claimId: string;
  claimNumber: string | null;
  isOpen: boolean;
  onClose: () => void;
  onShared: () => void;
}

export function ShareClaimDialog({
  claimId,
  claimNumber,
  isOpen,
  onClose,
  onShared,
}: ShareClaimDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("");
  const [isSharing, setIsSharing] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [inviteOrgSlug, setInviteOrgSlug] = useState("");

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

  // Get workspaces user can share to
  const { data: workspaces } = useQuery({
    queryKey: ["user-workspaces", userOrg?.org_id],
    queryFn: async () => {
      if (!userOrg?.org_id) return [];

      const { data } = await supabase
        .from("workspace_members")
        .select(`
          workspace_id,
          role,
          workspaces (id, name, owner_org_id)
        `)
        .eq("org_id", userOrg.org_id)
        .eq("status", "active")
        .in("role", ["owner", "collaborator"]);

      return data?.map((d: any) => d.workspaces) || [];
    },
    enabled: !!userOrg?.org_id,
  });

  // Get current claim's workspace
  const { data: currentWorkspace } = useQuery({
    queryKey: ["claim-workspace", claimId],
    queryFn: async () => {
      const { data } = await supabase
        .from("claims")
        .select("workspace_id, workspaces (id, name)")
        .eq("id", claimId)
        .single();

      return data?.workspaces;
    },
    enabled: !!claimId,
  });

  const handleShare = async () => {
    if (!selectedWorkspace) {
      toast({
        title: "Error",
        description: "Please select a workspace",
        variant: "destructive",
      });
      return;
    }

    setIsSharing(true);
    try {
      const { error } = await supabase
        .from("claims")
        .update({ workspace_id: selectedWorkspace })
        .eq("id", claimId);

      if (error) throw error;

      toast({
        title: "Claim shared",
        description: "Claim has been added to the workspace",
      });

      queryClient.invalidateQueries({ queryKey: ["claim-workspace"] });
      onShared();
      onClose();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSharing(false);
    }
  };

  const handleCreateAndShare = async () => {
    if (!newWorkspaceName.trim() || !userOrg?.org_id) {
      toast({
        title: "Error",
        description: "Workspace name is required",
        variant: "destructive",
      });
      return;
    }

    setIsSharing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create workspace
      const { data: workspace, error: wsError } = await supabase
        .from("workspaces")
        .insert({
          name: newWorkspaceName.trim(),
          owner_org_id: userOrg.org_id,
          created_by: user.id,
        })
        .select()
        .single();

      if (wsError) throw wsError;

      // Add owner org as workspace member
      await supabase
        .from("workspace_members")
        .insert({
          workspace_id: workspace.id,
          org_id: userOrg.org_id,
          role: "owner",
          status: "active",
          invited_by: user.id,
          joined_at: new Date().toISOString(),
        });

      // If partner slug provided, send invite
      if (inviteOrgSlug.trim()) {
        const { data: targetOrg } = await supabase
          .from("orgs")
          .select("id")
          .eq("slug", inviteOrgSlug.trim().toLowerCase())
          .maybeSingle();

        if (targetOrg) {
          await supabase
            .from("workspace_invites")
            .insert({
              workspace_id: workspace.id,
              invited_org_id: targetOrg.id,
              role: "collaborator",
              invited_by: user.id,
            });
        }
      }

      // Update claim with workspace
      await supabase
        .from("claims")
        .update({ workspace_id: workspace.id })
        .eq("id", claimId);

      toast({
        title: "Success",
        description: "Workspace created and claim shared",
      });

      queryClient.invalidateQueries({ queryKey: ["user-workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["claim-workspace"] });
      onShared();
      onClose();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSharing(false);
    }
  };

  const handleUnshare = async () => {
    setIsSharing(true);
    try {
      const { error } = await supabase
        .from("claims")
        .update({ workspace_id: null })
        .eq("id", claimId);

      if (error) throw error;

      toast({
        title: "Claim unshared",
        description: "Claim has been removed from the workspace",
      });

      queryClient.invalidateQueries({ queryKey: ["claim-workspace"] });
      onShared();
      onClose();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSharing(false);
    }
  };

  if (!userOrg) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Claim</DialogTitle>
            <DialogDescription>
              You need to create an organization first to share claims with partners.
            </DialogDescription>
          </DialogHeader>
          <div className="text-center py-4">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Go to Settings → Organization to create your organization.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share Claim with Partners</DialogTitle>
          <DialogDescription>
            Add this claim to a shared workspace for collaboration
          </DialogDescription>
        </DialogHeader>

        {currentWorkspace && (
          <div className="p-3 bg-muted rounded-lg mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Folder className="h-4 w-4 text-primary" />
                <span className="font-medium">{(currentWorkspace as any).name}</span>
              </div>
              <Badge>Currently shared</Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={handleUnshare}
              disabled={isSharing}
            >
              Remove from workspace
            </Button>
          </div>
        )}

        {!showCreateWorkspace ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Workspace</Label>
              <Select value={selectedWorkspace} onValueChange={setSelectedWorkspace}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a workspace" />
                </SelectTrigger>
                <SelectContent>
                  {workspaces?.map((ws: any) => (
                    <SelectItem key={ws.id} value={ws.id}>
                      {ws.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="text-center">
              <span className="text-sm text-muted-foreground">or</span>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowCreateWorkspace(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create New Workspace
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Workspace Name</Label>
              <Input
                placeholder="e.g., Partner Collaboration"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Invite Partner (optional)</Label>
              <Input
                placeholder="Partner organization slug"
                value={inviteOrgSlug}
                onChange={(e) => setInviteOrgSlug(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter the slug of the partner organization to invite them
              </p>
            </div>
            <Button
              variant="link"
              className="p-0"
              onClick={() => setShowCreateWorkspace(false)}
            >
              ← Back to workspace list
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {showCreateWorkspace ? (
            <Button onClick={handleCreateAndShare} disabled={isSharing}>
              {isSharing ? "Creating..." : "Create & Share"}
            </Button>
          ) : (
            <Button onClick={handleShare} disabled={isSharing || !selectedWorkspace}>
              {isSharing ? "Sharing..." : "Share Claim"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
