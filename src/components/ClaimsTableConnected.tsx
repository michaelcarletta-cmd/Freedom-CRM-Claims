import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, Search, Trash2 } from "lucide-react";
import { ClaimStatusSelect } from "./ClaimStatusSelect";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

interface Claim {
  id: string;
  claim_number: string;
  policyholder_name: string;
  policyholder_address: string;
  claim_amount: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  loss_type: string;
  is_closed: boolean;
  total_rcv?: number;
}

interface ClaimsTableConnectedProps {
  portalType?: "client" | "contractor" | "referrer";
}

export const ClaimsTableConnected = ({ portalType }: ClaimsTableConnectedProps) => {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [lossTypeFilter, setLossTypeFilter] = useState<string>("all");
  const [showClosed, setShowClosed] = useState(false);
  const [selectedClaims, setSelectedClaims] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeStatuses, setActiveStatuses] = useState<string[]>([]);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchClaims();
    fetchActiveStatuses();
  }, [portalType, user]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Use memoized filtering instead of state
  const filteredClaims = useMemo(() => {
    let filtered = [...claims];

    // Hide closed claims by default
    if (!showClosed) {
      filtered = filtered.filter((claim) => !claim.is_closed);
    }

    // Search filter (use debounced value)
    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase();
      filtered = filtered.filter(
        (claim) =>
          claim.claim_number?.toLowerCase().includes(query) ||
          claim.policyholder_name?.toLowerCase().includes(query) ||
          claim.policyholder_address?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((claim) => claim.status === statusFilter);
    }

    // Loss type filter
    if (lossTypeFilter !== "all") {
      filtered = filtered.filter((claim) => claim.loss_type === lossTypeFilter);
    }

    return filtered;
  }, [claims, debouncedSearch, statusFilter, lossTypeFilter, showClosed]);

  const toggleClaimSelection = (claimId: string) => {
    const newSelected = new Set(selectedClaims);
    if (newSelected.has(claimId)) {
      newSelected.delete(claimId);
    } else {
      newSelected.add(claimId);
    }
    setSelectedClaims(newSelected);
  };

  const toggleAllClaims = () => {
    if (selectedClaims.size === filteredClaims.length) {
      setSelectedClaims(new Set());
    } else {
      setSelectedClaims(new Set(filteredClaims.map(c => c.id)));
    }
  };

  const handleDeleteSelected = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("claims")
        .delete()
        .in("id", Array.from(selectedClaims));

      if (error) throw error;

      toast({
        title: "Success",
        description: `Successfully deleted ${selectedClaims.size} claim(s)`,
      });

      setSelectedClaims(new Set());
      setShowDeleteDialog(false);
      fetchClaims();
    } catch (error) {
      console.error("Error deleting claims:", error);
      toast({
        title: "Error",
        description: "Failed to delete claims",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const fetchClaims = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      let query = supabase.from("claims").select("*");

      // Filter based on portal type
      if (portalType === "client") {
        query = query.eq("client_id", user.id);
      } else if (portalType === "contractor") {
        const { data: assignments } = await supabase
          .from("claim_contractors")
          .select("claim_id")
          .eq("contractor_id", user.id);

        if (assignments && assignments.length > 0) {
          const claimIds = assignments.map((a) => a.claim_id);
          query = query.in("id", claimIds);
        } else {
          setClaims([]);
          setLoading(false);
          return;
        }
      } else if (portalType === "referrer") {
        // Find the referrer record linked to this user
        const { data: referrerData } = await supabase
          .from("referrers")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (referrerData?.id) {
          query = query.eq("referrer_id", referrerData.id);
        } else {
          setClaims([]);
          setLoading(false);
          return;
        }
      } else if (!portalType) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        const isAdmin = roles?.some((r) => r.role === "admin");
        const isStaff = roles?.some((r) => r.role === "staff");

        if (isStaff && !isAdmin) {
          const { data: staffAssignments } = await supabase
            .from("claim_staff")
            .select("claim_id")
            .eq("staff_id", user.id);

          if (staffAssignments && staffAssignments.length > 0) {
            const claimIds = staffAssignments.map((a) => a.claim_id);
            query = query.in("id", claimIds);
          } else {
            setClaims([]);
            setLoading(false);
            return;
          }
        }
      }

      const { data, error } = await query.order("updated_at", { ascending: false });

      if (error) throw error;

      // Fetch settlements for all claims to get RCV totals
      if (data && data.length > 0) {
        const claimIds = data.map(c => c.id);
        const { data: settlements } = await supabase
          .from("claim_settlements")
          .select("claim_id, replacement_cost_value")
          .in("claim_id", claimIds);

        // Calculate total RCV per claim
        const rcvByClaimId: Record<string, number> = {};
        settlements?.forEach(s => {
          rcvByClaimId[s.claim_id] = (rcvByClaimId[s.claim_id] || 0) + Number(s.replacement_cost_value || 0);
        });

        // Merge RCV into claims
        const claimsWithRcv = data.map(claim => ({
          ...claim,
          total_rcv: rcvByClaimId[claim.id] || 0
        }));

        setClaims(claimsWithRcv);
      } else {
        setClaims(data || []);
      }
    } catch (error) {
      console.error("Error fetching claims:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveStatuses = async () => {
    try {
      const { data, error } = await supabase
        .from("claim_statuses")
        .select("name, is_active");

      if (error) throw error;

      const active = (data || []).filter((s) => s.is_active).map((s) => s.name);
      setActiveStatuses(active);
    } catch (error) {
      console.error("Error fetching active statuses:", error);
    }
  };

  if (loading) {
    return <div className="p-8">Loading claims...</div>;
  }

  const uniqueStatuses = ["all", ...new Set(claims.map((c) => c.status).filter(Boolean))];
  const uniqueLossTypes = ["all", ...new Set(claims.map((c) => c.loss_type).filter(Boolean))];

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Claims</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3">
          {selectedClaims.size > 0 && (
            <div className="flex items-center justify-between p-3 bg-muted rounded-md">
              <span className="text-sm font-medium">
                {selectedClaims.size} claim(s) selected
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected
              </Button>
            </div>
          )}
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by claim number, client name, or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {uniqueStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status === "all" ? "All Statuses" : status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={lossTypeFilter} onValueChange={setLossTypeFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filter by loss type" />
              </SelectTrigger>
              <SelectContent>
                {uniqueLossTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type === "all" ? "All Loss Types" : type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Checkbox
                id="show-closed"
                checked={showClosed}
                onCheckedChange={(checked) => setShowClosed(checked as boolean)}
              />
              <Label htmlFor="show-closed" className="text-sm cursor-pointer">
                Show closed claims
              </Label>
            </div>
          </div>
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table className="min-w-[800px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={filteredClaims.length > 0 && selectedClaims.size === filteredClaims.length}
                    onCheckedChange={toggleAllClaims}
                  />
                </TableHead>
                <TableHead className="whitespace-nowrap">Claim #</TableHead>
                <TableHead className="whitespace-nowrap">Client Name</TableHead>
                <TableHead className="whitespace-nowrap">Property Address</TableHead>
                <TableHead className="whitespace-nowrap">Loss Type</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap">RCV Total</TableHead>
                <TableHead className="whitespace-nowrap">Date Submitted</TableHead>
                <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClaims.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    No claims found
                  </TableCell>
                </TableRow>
              ) : (
                filteredClaims.map((claim) => (
                  <TableRow 
                    key={claim.id} 
                    className="hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/claims/${claim.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedClaims.has(claim.id)}
                        onCheckedChange={() => toggleClaimSelection(claim.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{claim.claim_number}</TableCell>
                    <TableCell>{claim.policyholder_name}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {claim.policyholder_address || "N/A"}
                    </TableCell>
                    <TableCell>{claim.loss_type || "N/A"}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <ClaimStatusSelect 
                        claimId={claim.id} 
                        currentStatus={claim.status}
                      />
                    </TableCell>
                    <TableCell className="font-semibold">
                      {claim.total_rcv ? `$${claim.total_rcv.toLocaleString()}` : "N/A"}
                    </TableCell>
                    <TableCell>
                      {format(new Date(claim.created_at), "MMM dd, yyyy")}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => navigate(`/claims/${claim.id}`)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedClaims.size} Claim(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected claims and all associated data including:
              files, notes, tasks, payments, and accounting records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSelected}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
