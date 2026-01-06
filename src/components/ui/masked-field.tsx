import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";
import { getMaskedValue } from "@/hooks/usePIIMasking";
import { supabase } from "@/integrations/supabase/client";

interface MaskedFieldProps {
  value: string | null | undefined;
  fieldName: string;
  recordType: string;
  recordId: string;
  className?: string;
  showToggle?: boolean;
  defaultRevealed?: boolean;
}

export function MaskedField({
  value,
  fieldName,
  recordType,
  recordId,
  className,
  showToggle = true,
  defaultRevealed = false,
}: MaskedFieldProps) {
  const [revealed, setRevealed] = useState(defaultRevealed);

  const handleReveal = async () => {
    if (!revealed) {
      // Log the reveal action
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("pii_reveal_logs").insert({
            user_id: user.id,
            field_name: fieldName,
            record_type: recordType,
            record_id: recordId,
          });
          
          await supabase.rpc("log_audit", {
            p_action: "reveal_pii",
            p_record_type: recordType,
            p_record_id: recordId,
            p_metadata: { field_name: fieldName },
          });
        }
      } catch (error) {
        console.error("Failed to log PII reveal:", error);
      }
    }
    setRevealed(!revealed);
  };

  const displayValue = revealed ? (value || "—") : getMaskedValue(fieldName, value);

  if (!showToggle) {
    return (
      <span className={cn("font-mono text-sm", className)}>
        {displayValue}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("font-mono text-sm", !revealed && "text-muted-foreground")}>
        {displayValue}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 hover:bg-muted"
        onClick={handleReveal}
        title={revealed ? "Hide" : "Reveal"}
      >
        {revealed ? (
          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </Button>
    </span>
  );
}
