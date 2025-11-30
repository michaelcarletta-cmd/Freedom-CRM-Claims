import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye } from "lucide-react";
import { ClaimStatusSelect } from "./ClaimStatusSelect";
import { format } from "date-fns";

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

export const ClaimsTableConnected = () => {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchClaims();
  }, []);

  const fetchClaims = async () => {
    try {
      const { data, error } = await supabase
        .from("claims")
        .select("*")
        .order("created_at", { ascending: false });

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

  return (
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
          {claims.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                No claims found
              </TableCell>
            </TableRow>
          ) : (
            claims.map((claim) => (
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
  );
};
