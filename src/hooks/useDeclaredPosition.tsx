import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface DeclaredPosition {
  id: string;
  claim_id: string;
  primary_cause_of_loss: string | null;
  primary_coverage_theory: string | null;
  primary_carrier_error: string | null;
  carrier_dependency_statement: string | null;
  confidence_level: string;
  reasoning_complete: boolean;
  position_locked: boolean;
  risk_flags: string[];
  missing_inputs: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useDeclaredPosition(claimId: string) {
  const [position, setPosition] = useState<DeclaredPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchPosition = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("darwin_declared_positions")
      .select("*")
      .eq("claim_id", claimId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching declared position:", error);
    }
    setPosition(data as DeclaredPosition | null);
    setLoading(false);
  }, [claimId]);

  useEffect(() => {
    fetchPosition();
  }, [fetchPosition]);

  const savePosition = async (fields: Partial<DeclaredPosition>) => {
    const { data: userData } = await supabase.auth.getUser();
    
    if (position) {
      const { error } = await supabase
        .from("darwin_declared_positions")
        .update(fields)
        .eq("id", position.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("darwin_declared_positions")
        .insert({
          claim_id: claimId,
          created_by: userData.user?.id,
          ...fields,
        });
      if (error) throw error;
    }
    await fetchPosition();
  };

  const lockPosition = async () => {
    if (!position) return;
    const missing: string[] = [];
    if (!position.primary_cause_of_loss) missing.push("Primary Cause of Loss");
    if (!position.primary_coverage_theory) missing.push("Primary Coverage Theory");
    if (!position.primary_carrier_error) missing.push("Primary Carrier Error");
    if (!position.carrier_dependency_statement) missing.push("Carrier Dependency Statement");

    if (missing.length > 0) {
      toast({
        title: "Cannot lock position",
        description: `Missing: ${missing.join(", ")}`,
        variant: "destructive",
      });
      return false;
    }

    await savePosition({
      position_locked: true,
      reasoning_complete: true,
      missing_inputs: [],
      risk_flags: [],
      confidence_level: "high",
    });
    toast({ title: "Position locked", description: "Declared position is now locked for carrier-facing outputs." });
    return true;
  };

  const unlockPosition = async () => {
    if (!position) return;
    await savePosition({ position_locked: false });
    toast({ title: "Position unlocked", description: "You can now edit the declared position." });
  };

  const isLocked = position?.position_locked ?? false;
  const isSet = !!position && !!(position.primary_cause_of_loss || position.primary_coverage_theory || position.primary_carrier_error);

  return {
    position,
    loading,
    isLocked,
    isSet,
    savePosition,
    lockPosition,
    unlockPosition,
    refetch: fetchPosition,
  };
}
