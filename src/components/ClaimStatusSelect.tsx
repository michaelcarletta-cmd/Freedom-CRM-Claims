import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ClaimStatus {
  id: string;
  name: string;
  color: string;
}

interface ClaimStatusSelectProps {
  claimId: string;
  currentStatus: string;
  onStatusChange?: (newStatus: string) => void;
}

export function ClaimStatusSelect({ claimId, currentStatus, onStatusChange }: ClaimStatusSelectProps) {
  const [statuses, setStatuses] = useState<ClaimStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchStatuses();
  }, []);

  const fetchStatuses = async () => {
    try {
      const { data, error } = await supabase
        .from("claim_statuses")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (error) throw error;
      setStatuses(data || []);
    } catch (error: any) {
      console.error("Error fetching statuses:", error);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("claims")
        .update({ status: newStatus })
        .eq("id", claimId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Claim status updated successfully",
      });

      onStatusChange?.(newStatus);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Select value={currentStatus} onValueChange={handleStatusChange} disabled={loading}>
      <SelectTrigger className="w-[180px] rounded-sm">
        <SelectValue placeholder="Select status" />
      </SelectTrigger>
      <SelectContent>
        {statuses.map((status) => (
          <SelectItem key={status.id} value={status.name}>
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2"
                style={{ backgroundColor: status.color }}
              />
              {status.name}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
