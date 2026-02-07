import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDeclaredPosition } from "@/hooks/useDeclaredPosition";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Lock, Unlock, AlertTriangle, Shield, Sparkles, Loader2, CheckCircle2, XCircle, Edit } from "lucide-react";

interface DarwinDeclaredPositionProps {
  claimId: string;
  claim: any;
}

export const DarwinDeclaredPosition = ({ claimId, claim }: DarwinDeclaredPositionProps) => {
  const { position, loading, isLocked, isSet, savePosition, lockPosition, unlockPosition } = useDeclaredPosition(claimId);
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const [fields, setFields] = useState({
    primary_cause_of_loss: "",
    primary_coverage_theory: "",
    primary_carrier_error: "",
    carrier_dependency_statement: "",
    confidence_level: "medium",
  });

  const startEditing = () => {
    setFields({
      primary_cause_of_loss: position?.primary_cause_of_loss || "",
      primary_coverage_theory: position?.primary_coverage_theory || "",
      primary_carrier_error: position?.primary_carrier_error || "",
      carrier_dependency_statement: position?.carrier_dependency_statement || "",
      confidence_level: position?.confidence_level || "medium",
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      await savePosition(fields);
      setIsEditing(false);
      toast({ title: "Position saved", description: "Declared position updated successfully." });
    } catch (error: any) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    }
  };

  const handleAutoDetect = async () => {
    setIsAutoDetecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("darwin-ai-analysis", {
        body: {
          claimId,
          analysisType: "position_detection",
          claim,
        },
      });

      if (error) throw error;

      if (data?.result) {
        // Try to parse structured JSON from the result
        try {
          const parsed = JSON.parse(data.result);
          const detected = {
            primary_cause_of_loss: parsed.primary_cause_of_loss || "",
            primary_coverage_theory: parsed.primary_coverage_theory || "",
            primary_carrier_error: parsed.primary_carrier_error || "",
            carrier_dependency_statement: parsed.carrier_dependency_statement || "",
            confidence_level: parsed.confidence_level || "medium",
          };
          setFields(detected);
          setIsEditing(true);

          // Save with risk flags if confidence is low
          const missingInputs = parsed.missing_inputs || [];
          const riskFlags = parsed.risk_flags || [];
          await savePosition({
            ...detected,
            missing_inputs: missingInputs,
            risk_flags: riskFlags,
            reasoning_complete: false,
            position_locked: false,
          });

          toast({
            title: "Position auto-detected",
            description: missingInputs.length > 0
              ? `Review and confirm. ${missingInputs.length} inputs still needed.`
              : "Review the detected position and lock when ready.",
          });
        } catch {
          // If not JSON, show raw result
          toast({ title: "Detection complete", description: "Could not parse structured position. Check result." });
        }
      }
    } catch (error: any) {
      toast({ title: "Auto-detect failed", description: error.message, variant: "destructive" });
    } finally {
      setIsAutoDetecting(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-primary/30">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
          <span className="text-sm text-muted-foreground">Loading position...</span>
        </CardContent>
      </Card>
    );
  }

  const statusIcon = isLocked
    ? <Lock className="h-4 w-4 text-green-600" />
    : isSet
    ? <AlertTriangle className="h-4 w-4 text-yellow-600" />
    : <XCircle className="h-4 w-4 text-destructive" />;

  const statusLabel = isLocked ? "Locked" : isSet ? "Provisional" : "Not Set";
  const statusColor = isLocked ? "bg-green-100 text-green-800 border-green-300" : isSet ? "bg-yellow-100 text-yellow-800 border-yellow-300" : "bg-red-100 text-red-800 border-red-300";

  return (
    <Card className={`border-2 ${isLocked ? "border-green-500/30" : isSet ? "border-yellow-500/30" : "border-destructive/30"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5 text-primary" />
            Declared Position
          </CardTitle>
          <Badge className={statusColor}>
            {statusIcon}
            <span className="ml-1">{statusLabel}</span>
          </Badge>
        </div>
        <CardDescription className="text-xs">
          Lock your strategic position before generating carrier-facing outputs
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isLocked && !isSet && (
          <Alert className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-sm">
              Position must be declared before generating carrier-facing outputs. Set your position manually or use Auto-Detect.
            </AlertDescription>
          </Alert>
        )}

        {!isLocked && isSet && position?.missing_inputs && position.missing_inputs.length > 0 && (
          <Alert className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-sm">
              <strong>Missing inputs:</strong> {position.missing_inputs.join(", ")}
            </AlertDescription>
          </Alert>
        )}

        {isEditing ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Primary Cause of Loss</Label>
              <Textarea
                value={fields.primary_cause_of_loss}
                onChange={(e) => setFields(f => ({ ...f, primary_cause_of_loss: e.target.value }))}
                placeholder='e.g., "Wind-driven rain intrusion from Hurricane Ian"'
                className="min-h-[60px] text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Primary Coverage Theory</Label>
              <Textarea
                value={fields.primary_coverage_theory}
                onChange={(e) => setFields(f => ({ ...f, primary_coverage_theory: e.target.value }))}
                placeholder='e.g., "Direct physical loss from covered peril per Section I"'
                className="min-h-[60px] text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Primary Carrier Error</Label>
              <Textarea
                value={fields.primary_carrier_error}
                onChange={(e) => setFields(f => ({ ...f, primary_carrier_error: e.target.value }))}
                placeholder='e.g., "Carrier misapplied maintenance exclusion to storm damage"'
                className="min-h-[60px] text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Carrier Dependency Statement</Label>
              <Textarea
                value={fields.carrier_dependency_statement}
                onChange={(e) => setFields(f => ({ ...f, carrier_dependency_statement: e.target.value }))}
                placeholder="e.g., For the carrier's conclusion to be correct, the damage would need to result from long-term wear rather than the documented storm event"
                className="min-h-[60px] text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Confidence Level</Label>
              <Select value={fields.confidence_level} onValueChange={(v) => setFields(f => ({ ...f, confidence_level: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} size="sm">
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Save Position
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <>
            {isSet && position && (
              <div className="space-y-2 text-sm">
                <div className="p-2 bg-muted/50 rounded">
                  <span className="text-xs font-semibold text-muted-foreground">Cause of Loss:</span>
                  <p>{position.primary_cause_of_loss || "Not set"}</p>
                </div>
                <div className="p-2 bg-muted/50 rounded">
                  <span className="text-xs font-semibold text-muted-foreground">Coverage Theory:</span>
                  <p>{position.primary_coverage_theory || "Not set"}</p>
                </div>
                <div className="p-2 bg-muted/50 rounded">
                  <span className="text-xs font-semibold text-muted-foreground">Carrier Error:</span>
                  <p>{position.primary_carrier_error || "Not set"}</p>
                </div>
                <div className="p-2 bg-muted/50 rounded">
                  <span className="text-xs font-semibold text-muted-foreground">Carrier Dependency:</span>
                  <p>{position.carrier_dependency_statement || "Not set"}</p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {!isLocked && (
                <>
                  <Button variant="outline" size="sm" onClick={startEditing}>
                    <Edit className="h-4 w-4 mr-1" />
                    {isSet ? "Edit" : "Set Position"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleAutoDetect} disabled={isAutoDetecting}>
                    {isAutoDetecting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                    Auto-Detect
                  </Button>
                  {isSet && (
                    <Button size="sm" onClick={lockPosition} className="bg-green-600 hover:bg-green-700">
                      <Lock className="h-4 w-4 mr-1" />
                      Lock Position
                    </Button>
                  )}
                </>
              )}
              {isLocked && (
                <Button variant="outline" size="sm" onClick={unlockPosition}>
                  <Unlock className="h-4 w-4 mr-1" />
                  Unlock to Edit
                </Button>
              )}
            </div>
          </>
        )}

        {position?.risk_flags && position.risk_flags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {position.risk_flags.map((flag, i) => (
              <Badge key={i} variant="destructive" className="text-xs">{flag}</Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
