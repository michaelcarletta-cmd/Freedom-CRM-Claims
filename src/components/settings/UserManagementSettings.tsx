import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Trash2, Shield } from "lucide-react";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
}

interface UserRole {
  id: string;
  user_id: string;
  role: "admin" | "staff" | "client" | "contractor" | "referrer";
}

interface UserWithRoles extends Profile {
  roles: UserRole[];
}

const ROLE_LABELS = {
  admin: "Admin",
  staff: "Staff",
  client: "Client",
  contractor: "Contractor",
  referrer: "Referrer",
};

const ROLE_COLORS = {
  admin: "destructive",
  staff: "default",
  client: "secondary",
  contractor: "outline",
  referrer: "outline",
} as const;

export function UserManagementSettings() {
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchCurrentUser();
    fetchUsers();
  }, []);

  const fetchCurrentUser = async () => {
    const { data } = await supabase.auth.getUser();
    setCurrentUserId(data.user?.id || null);
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      
      // Fetch all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("email");

      if (profilesError) {
        console.error("Profiles error:", profilesError);
        throw profilesError;
      }

      // Fetch all user roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("*");

      if (rolesError) {
        console.error("Roles error:", rolesError);
        throw rolesError;
      }

      console.log("Fetched profiles:", profiles);
      console.log("Fetched roles:", roles);

      // Combine profiles with their roles, only show users who have at least one role
      const usersWithRoles: UserWithRoles[] = (profiles || [])
        .map((profile) => ({
          ...profile,
          roles: (roles || []).filter((role) => role.user_id === profile.id),
        }))
        .filter((user) => user.roles.length > 0);

      console.log("Users with roles:", usersWithRoles);
      setUsers(usersWithRoles);
    } catch (error: any) {
      console.error("Error fetching users:", error);
      toast({
        title: "Error",
        description: `Failed to load users: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addRole = async (userId: string, role: string) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .insert({
          user_id: userId,
          role: role as any,
        });

      if (error) {
        if (error.code === "23505") {
          toast({
            title: "Info",
            description: "User already has this role",
            variant: "default",
          });
          return;
        }
        throw error;
      }

      toast({
        title: "Success",
        description: "Role added successfully",
      });

      fetchUsers();
    } catch (error: any) {
      console.error("Failed to add role", error);
      toast({
        title: "Error",
        description: error?.message || error?.details || "Failed to add role",
        variant: "destructive",
      });
    }
  };

  const removeRole = async (roleId: string, userId: string, role: string) => {
    // Prevent removing your own admin role
    if (userId === currentUserId && role === "admin") {
      toast({
        title: "Cannot Remove Your Own Admin Role",
        description: "You cannot remove your own admin role. Ask another admin to remove it if needed.",
        variant: "destructive",
      });
      return;
    }

    if (!confirm("Are you sure you want to remove this role?")) return;

    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("id", roleId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Role removed successfully",
      });

      fetchUsers();
    } catch (error: any) {
      console.error("Failed to remove role", error);
      toast({
        title: "Error",
        description: error?.message || error?.details || "Failed to remove role",
        variant: "destructive",
      });
    }
  };

  const removeAllRoles = async (userId: string, userName: string) => {
    // Prevent removing your own roles
    if (userId === currentUserId) {
      toast({
        title: "Cannot Remove Your Own Roles",
        description: "You cannot remove your own roles. Ask another admin to manage your access if needed.",
        variant: "destructive",
      });
      return;
    }

    if (!confirm(`Are you sure you want to remove all roles from ${userName}? This will remove their access to the system.`)) return;

    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "All roles removed successfully",
      });

      fetchUsers();
    } catch (error: any) {
      console.error("Failed to remove all roles", error);
      toast({
        title: "Error",
        description: error?.message || error?.details || "Failed to remove roles",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading users...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">User Management</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Manage user roles and permissions for portal access
        </p>
      </div>

      <Card className="p-6">
        <div className="space-y-4">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-start justify-between p-4 border border-border rounded-lg"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <p className="text-foreground font-medium">
                    {user.full_name || "Unnamed User"}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{user.email}</p>
                
                <div className="flex flex-wrap gap-2">
                  {user.roles.length === 0 ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      No roles assigned
                    </Badge>
                  ) : (
                    user.roles.map((userRole) => (
                      <Badge
                        key={userRole.id}
                        variant={ROLE_COLORS[userRole.role]}
                        className="flex items-center gap-2"
                      >
                        {ROLE_LABELS[userRole.role]}
                        <button
                          onClick={() => removeRole(userRole.id, user.id, userRole.role)}
                          className="ml-1 hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))
                  )}
                </div>
              </div>

              <div className="ml-4 flex items-center gap-2">
                <Select
                  onValueChange={(role) => addRole(user.id, role)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Add role..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4" />
                        Admin
                      </div>
                    </SelectItem>
                    <SelectItem value="staff">
                      <div className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4" />
                        Staff
                      </div>
                    </SelectItem>
                    <SelectItem value="client">
                      <div className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4" />
                        Client
                      </div>
                    </SelectItem>
                    <SelectItem value="contractor">
                      <div className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4" />
                        Contractor
                      </div>
                    </SelectItem>
                    <SelectItem value="referrer">
                      <div className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4" />
                        Referrer
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                
                {user.roles.length > 0 && (
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => removeAllRoles(user.id, user.full_name || user.email)}
                    title="Remove all roles from this user"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}

          {users.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No users found
            </div>
          )}
        </div>
      </Card>

      <Card className="p-4 bg-muted/50 border-border">
        <div className="flex gap-3">
          <Shield className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">Role Descriptions</p>
            <ul className="text-muted-foreground space-y-1 list-disc list-inside">
              <li><strong>Admin:</strong> Full system access, can manage all settings and users</li>
              <li><strong>Staff:</strong> Can manage claims, clients, and tasks</li>
              <li><strong>Client:</strong> Can only view claims they're assigned to via portal</li>
              <li><strong>Contractor:</strong> Can view claims they're assigned to work on</li>
              <li><strong>Referrer:</strong> Can view claims they've referred</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
