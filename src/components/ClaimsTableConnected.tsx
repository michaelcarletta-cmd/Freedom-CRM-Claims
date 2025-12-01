import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, Search } from "lucide-react";
import { ClaimStatusSelect } from "./ClaimStatusSelect";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

interface Claim {
  id: string;
  claim_number: string;
  policyholder_name: string;
  policyholder_address: string;
  claim_amount: number | null;
  status: string;
  created_at: string;
  loss_type: string;
}

interface ClaimsTableConnectedProps {
  portalType?: "client" | "contractor" | "referrer";
}

export const ClaimsTableConnected = ({ portalType }: ClaimsTableConnectedProps) => {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [filteredClaims, setFilteredClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [lossTypeFilter, setLossTypeFilter] = useState<string>("all");
  const [showClosed, setShowClosed] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    fetchClaims();
  }, [portalType, user]);

  useEffect(() => {
    filterClaims();
  }, [claims, searchQuery, statusFilter, lossTypeFilter, showClosed]);

  const filterClaims = () => {
    let filtered = [...claims];

    // Hide closed claims by default
    if (!showClosed) {
      filtered = filtered.filter((claim) => claim.status !== "closed");
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (claim) =>
          claim.claim_number.toLowerCase().includes(query) ||
          claim.policyholder_name.toLowerCase().includes(query) ||
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

    setFilteredClaims(filtered);
  };

  const fetchClaims = async () => {
    if (!user && portalType) {
      setLoading(false);
      return;
    }

    try {
      let query = supabase.from("claims").select("*");

      // Filter based on portal type
      if (portalType === "client") {
        query = query.eq("client_id", user?.id);
      } else if (portalType === "contractor") {
        // Get claim IDs assigned to this contractor
        const { data: assignments } = await supabase
          .from("claim_contractors")
          .select("claim_id")
          .eq("contractor_id", user?.id);
        
        if (assignments && assignments.length > 0) {
          const claimIds = assignments.map(a => a.claim_id);
          query = query.in("id", claimIds);
        } else {
          setClaims([]);
          setLoading(false);
          return;
        }
      } else if (portalType === "referrer") {
        query = query.eq("referrer_id", user?.id);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;
      setClaims(data || []);
    } catch (error) {
      console.error("Error fetching claims:", error);
    } finally {
      setLoading(false);
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

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim #</TableHead>
                <TableHead>Client Name</TableHead>
                <TableHead>Property Address</TableHead>
                <TableHead>Loss Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Date Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClaims.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
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
                      {claim.claim_amount ? `$${claim.claim_amount.toLocaleString()}` : "N/A"}
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
    </Card>
  );
};
