import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, RefreshCw, Lock, Unlock, Users, UserPlus, CheckSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface BulkClaimActionsProps {
  selectedClaims: Set<string>;
  onClearSelection: () => void;
  onDeleteRequest: () => void;
}

export const BulkClaimActions = ({ 
  selectedClaims, 
  onClearSelection,
  onDeleteRequest 
}: BulkClaimActionsProps) => {
  const [updating, setUpdating] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'close' | 'reopen' | null;
    title: string;
    description: string;
  }>({ type: null, title: '', description: '' });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch claim statuses - cached for 5 minutes
  const { data: statuses = [] } = useQuery({
    queryKey: ["claim-statuses-bulk"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_statuses")
        .select("id, name, is_active")
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Fetch staff members (admin and staff roles only) - cached for 5 minutes
  const { data: staffMembers = [] } = useQuery({
    queryKey: ["staff-members-bulk"],
    queryFn: async () => {
      // Fetch all data in parallel
      const [rolesRes, externalRolesRes, profilesRes] = await Promise.all([
        supabase.from("user_roles").select("user_id, role").in("role", ["admin", "staff"]),
        supabase.from("user_roles").select("user_id").in("role", ["client", "contractor", "referrer"]),
        supabase.from("profiles").select("id, full_name, email"),
      ]);

      if (rolesRes.error) throw rolesRes.error;
      if (!rolesRes.data?.length) return [];

      const staffUserIds = new Set(rolesRes.data.map(r => r.user_id));
      const externalUserIds = new Set(externalRolesRes.data?.map(r => r.user_id) || []);
      
      return (profilesRes.data || []).filter(p => 
        staffUserIds.has(p.id) && !externalUserIds.has(p.id)
      );
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Fetch contractors - cached for 5 minutes
  const { data: contractors = [] } = useQuery({
    queryKey: ["contractors-bulk"],
    queryFn: async () => {
      const [rolesRes, profilesRes] = await Promise.all([
        supabase.from("user_roles").select("user_id").eq("role", "contractor"),
        supabase.from("profiles").select("id, full_name, email"),
      ]);

      if (rolesRes.error) throw rolesRes.error;
      if (!rolesRes.data?.length) return [];

      const contractorIds = new Set(rolesRes.data.map(r => r.user_id));
      return (profilesRes.data || []).filter(p => contractorIds.has(p.id));
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const handleBulkStatusUpdate = async (newStatus: string) => {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("claims")
        .update({ status: newStatus })
        .in("id", Array.from(selectedClaims));

      if (error) throw error;

      toast({
        title: "Success",
        description: `Updated status to "${newStatus}" for ${selectedClaims.size} claim(s)`,
      });

      onClearSelection();
      queryClient.invalidateQueries({ queryKey: ["claims"] });
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        title: "Error",
        description: "Failed to update claim statuses",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleBulkStaffAssignment = async (staffId: string) => {
    setUpdating(true);
    try {
      const claimIds = Array.from(selectedClaims);
      
      // Get existing assignments to avoid duplicates
      const { data: existingAssignments } = await supabase
        .from("claim_staff")
        .select("claim_id")
        .eq("staff_id", staffId)
        .in("claim_id", claimIds);

      const existingClaimIds = new Set(existingAssignments?.map(a => a.claim_id) || []);
      const newClaimIds = claimIds.filter(id => !existingClaimIds.has(id));

      if (newClaimIds.length > 0) {
        const { error } = await supabase
          .from("claim_staff")
          .insert(newClaimIds.map(claimId => ({
            claim_id: claimId,
            staff_id: staffId,
          })));

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: `Assigned staff to ${selectedClaims.size} claim(s)`,
      });

      onClearSelection();
      queryClient.invalidateQueries({ queryKey: ["claims"] });
    } catch (error) {
      console.error("Error assigning staff:", error);
      toast({
        title: "Error",
        description: "Failed to assign staff",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleBulkContractorAssignment = async (contractorId: string) => {
    setUpdating(true);
    try {
      const claimIds = Array.from(selectedClaims);
      
      // Get existing assignments to avoid duplicates
      const { data: existingAssignments } = await supabase
        .from("claim_contractors")
        .select("claim_id")
        .eq("contractor_id", contractorId)
        .in("claim_id", claimIds);

      const existingClaimIds = new Set(existingAssignments?.map(a => a.claim_id) || []);
      const newClaimIds = claimIds.filter(id => !existingClaimIds.has(id));

      if (newClaimIds.length > 0) {
        const { error } = await supabase
          .from("claim_contractors")
          .insert(newClaimIds.map(claimId => ({
            claim_id: claimId,
            contractor_id: contractorId,
          })));

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: `Assigned contractor to ${selectedClaims.size} claim(s)`,
      });

      onClearSelection();
      queryClient.invalidateQueries({ queryKey: ["claims"] });
    } catch (error) {
      console.error("Error assigning contractor:", error);
      toast({
        title: "Error",
        description: "Failed to assign contractor",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleBulkCloseClaims = async () => {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("claims")
        .update({ is_closed: true })
        .in("id", Array.from(selectedClaims));

      if (error) throw error;

      toast({
        title: "Success",
        description: `Closed ${selectedClaims.size} claim(s)`,
      });

      onClearSelection();
      setConfirmAction({ type: null, title: '', description: '' });
      queryClient.invalidateQueries({ queryKey: ["claims"] });
    } catch (error) {
      console.error("Error closing claims:", error);
      toast({
        title: "Error",
        description: "Failed to close claims",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleBulkReopenClaims = async () => {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("claims")
        .update({ is_closed: false })
        .in("id", Array.from(selectedClaims));

      if (error) throw error;

      toast({
        title: "Success",
        description: `Reopened ${selectedClaims.size} claim(s)`,
      });

      onClearSelection();
      setConfirmAction({ type: null, title: '', description: '' });
      queryClient.invalidateQueries({ queryKey: ["claims"] });
    } catch (error) {
      console.error("Error reopening claims:", error);
      toast({
        title: "Error",
        description: "Failed to reopen claims",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between p-3 bg-muted rounded-md">
        <span className="text-sm font-medium">
          {selectedClaims.size} claim(s) selected
        </span>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={updating}>
                <CheckSquare className="h-4 w-4 mr-2" />
                Bulk Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/* Status Update */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Update Status
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {statuses.map((status) => (
                    <DropdownMenuItem
                      key={status.id}
                      onClick={() => handleBulkStatusUpdate(status.name)}
                    >
                      {status.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {/* Staff Assignment */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Users className="h-4 w-4 mr-2" />
                  Assign Staff
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {staffMembers.length === 0 ? (
                    <DropdownMenuItem disabled>No staff available</DropdownMenuItem>
                  ) : (
                    staffMembers.map((staff) => (
                      <DropdownMenuItem
                        key={staff.id}
                        onClick={() => handleBulkStaffAssignment(staff.id)}
                      >
                        {staff.full_name || staff.email}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {/* Contractor Assignment */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Assign Contractor
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {contractors.length === 0 ? (
                    <DropdownMenuItem disabled>No contractors available</DropdownMenuItem>
                  ) : (
                    contractors.map((contractor) => (
                      <DropdownMenuItem
                        key={contractor.id}
                        onClick={() => handleBulkContractorAssignment(contractor.id)}
                      >
                        {contractor.full_name || contractor.email}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />

              {/* Close Claims */}
              <DropdownMenuItem
                onClick={() => setConfirmAction({
                  type: 'close',
                  title: `Close ${selectedClaims.size} Claim(s)?`,
                  description: 'This will mark the selected claims as closed. Their current status will be preserved and they can be reopened later.',
                })}
              >
                <Lock className="h-4 w-4 mr-2" />
                Close Claims
              </DropdownMenuItem>

              {/* Reopen Claims */}
              <DropdownMenuItem
                onClick={() => setConfirmAction({
                  type: 'reopen',
                  title: `Reopen ${selectedClaims.size} Claim(s)?`,
                  description: 'This will reopen the selected claims and restore them to active status.',
                })}
              >
                <Unlock className="h-4 w-4 mr-2" />
                Reopen Claims
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/* Delete */}
              <DropdownMenuItem
                onClick={onDeleteRequest}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AlertDialog 
        open={confirmAction.type !== null} 
        onOpenChange={(open) => !open && setConfirmAction({ type: null, title: '', description: '' })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAction.type === 'close' ? handleBulkCloseClaims : handleBulkReopenClaims}
              disabled={updating}
            >
              {updating ? "Processing..." : confirmAction.type === 'close' ? 'Close Claims' : 'Reopen Claims'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
