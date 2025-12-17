import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Building2, UserPlus, Trash2, Crown, Shield, User } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

interface OrgMember {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profiles?: {
    email: string;
    full_name: string | null;
  };
}

interface Org {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  logo_url: string | null;
  created_at: string;
}

export function OrganizationSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [newOrgDomain, setNewOrgDomain] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("member");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);

  // Get current user's organization
  const { data: userOrg, isLoading: loadingOrg } = useQuery({
    queryKey: ["user-organization"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: membership } = await supabase
        .from("org_members")
        .select(`
          *,
          orgs (*)
        `)
        .eq("user_id", user.id)
        .maybeSingle();

      return membership;
    },
  });

  // Get organization members
  const { data: orgMembers, isLoading: loadingMembers } = useQuery({
    queryKey: ["org-members", userOrg?.org_id],
    queryFn: async () => {
      if (!userOrg?.org_id) return [];

      const { data } = await supabase
        .from("org_members")
        .select(`
          *,
          profiles:user_id (
            email,
            full_name
          )
        `)
        .eq("org_id", userOrg.org_id)
        .order("created_at");

      return data || [];
    },
    enabled: !!userOrg?.org_id,
  });

  const handleCreateOrg = async () => {
    if (!newOrgName.trim() || !newOrgSlug.trim()) {
      toast({
        title: "Error",
        description: "Organization name and slug are required",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create the organization
      const { data: newOrg, error: orgError } = await supabase
        .from("orgs")
        .insert({
          name: newOrgName.trim(),
          slug: newOrgSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"),
          domain: newOrgDomain.trim() || null,
        })
        .select()
        .single();

      if (orgError) throw orgError;

      // Add current user as owner
      const { error: memberError } = await supabase
        .from("org_members")
        .insert({
          org_id: newOrg.id,
          user_id: user.id,
          role: "owner",
        });

      if (memberError) throw memberError;

      toast({
        title: "Success",
        description: "Organization created successfully",
      });

      setShowCreateDialog(false);
      setNewOrgName("");
      setNewOrgSlug("");
      setNewOrgDomain("");
      queryClient.invalidateQueries({ queryKey: ["user-organization"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleAddMember = async () => {
    if (!newMemberEmail.trim() || !userOrg?.org_id) {
      toast({
        title: "Error",
        description: "Email is required",
        variant: "destructive",
      });
      return;
    }

    setIsAddingMember(true);
    try {
      // Find user by email
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", newMemberEmail.trim())
        .maybeSingle();

      if (!profile) {
        toast({
          title: "User not found",
          description: "No user found with that email address",
          variant: "destructive",
        });
        return;
      }

      // Check if already a member
      const { data: existing } = await supabase
        .from("org_members")
        .select("id")
        .eq("org_id", userOrg.org_id)
        .eq("user_id", profile.id)
        .maybeSingle();

      if (existing) {
        toast({
          title: "Already a member",
          description: "This user is already a member of your organization",
          variant: "destructive",
        });
        return;
      }

      // Add member
      const { error } = await supabase
        .from("org_members")
        .insert({
          org_id: userOrg.org_id,
          user_id: profile.id,
          role: newMemberRole,
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Member added successfully",
      });

      setShowAddMemberDialog(false);
      setNewMemberEmail("");
      setNewMemberRole("member");
      queryClient.invalidateQueries({ queryKey: ["org-members"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      const { error } = await supabase
        .from("org_members")
        .delete()
        .eq("id", memberId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Member removed",
      });
      queryClient.invalidateQueries({ queryKey: ["org-members"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from("org_members")
        .update({ role: newRole })
        .eq("id", memberId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Role updated",
      });
      queryClient.invalidateQueries({ queryKey: ["org-members"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "owner":
        return <Crown className="h-4 w-4 text-yellow-500" />;
      case "admin":
        return <Shield className="h-4 w-4 text-blue-500" />;
      default:
        return <User className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const isOrgAdmin = userOrg?.role === "owner" || userOrg?.role === "admin";

  if (loadingOrg) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  // No organization - show create prompt
  if (!userOrg) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Organization
          </CardTitle>
          <CardDescription>
            Create an organization to enable workspace collaboration with partner companies
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Building2 className="h-4 w-4 mr-2" />
                Create Organization
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Organization</DialogTitle>
                <DialogDescription>
                  Set up your company organization to collaborate with partners
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Organization Name</Label>
                  <Input
                    placeholder="e.g., Freedom Claims"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Slug (URL-friendly identifier)</Label>
                  <Input
                    placeholder="e.g., freedom-claims"
                    value={newOrgSlug}
                    onChange={(e) => setNewOrgSlug(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Domain (optional)</Label>
                  <Input
                    placeholder="e.g., freedomclaims.com"
                    value={newOrgDomain}
                    onChange={(e) => setNewOrgDomain(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Users with this email domain can auto-join your organization
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateOrg} disabled={isCreating}>
                  {isCreating ? "Creating..." : "Create Organization"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    );
  }

  // Has organization - show details
  const org = userOrg.orgs as unknown as Org;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {org.name}
          </CardTitle>
          <CardDescription>
            Manage your organization and team members
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Slug</Label>
              <p className="font-medium">{org.slug}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Domain</Label>
              <p className="font-medium">{org.domain || "Not set"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>
              People in your organization
            </CardDescription>
          </div>
          {isOrgAdmin && (
            <Dialog open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Team Member</DialogTitle>
                  <DialogDescription>
                    Add an existing user to your organization
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Email Address</Label>
                    <Input
                      type="email"
                      placeholder="user@example.com"
                      value={newMemberEmail}
                      onChange={(e) => setNewMemberEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={newMemberRole} onValueChange={setNewMemberRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddMemberDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddMember} disabled={isAddingMember}>
                    {isAddingMember ? "Adding..." : "Add Member"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                {isOrgAdmin && <TableHead className="w-12"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgMembers?.map((member: any) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    {member.profiles?.full_name || "—"}
                  </TableCell>
                  <TableCell>{member.profiles?.email}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getRoleIcon(member.role)}
                      {isOrgAdmin && member.role !== "owner" ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) => handleUpdateRole(member.id, value)}
                        >
                          <SelectTrigger className="w-24 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={member.role === "owner" ? "default" : "secondary"}>
                          {member.role}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  {isOrgAdmin && (
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
    </div>
  );
}
