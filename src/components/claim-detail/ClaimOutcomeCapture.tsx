import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Trophy, 
  DollarSign, 
  Calendar, 
  CheckCircle2,
  XCircle,
  Lightbulb,
  FileText,
  TrendingUp,
  Loader2
} from "lucide-react";

interface ClaimOutcomeCaptureProps {
  claimId: string;
  claim: any;
  isOpen: boolean;
  onClose: () => void;
}

interface OutcomeData {
  final_settlement: number;
  initial_estimate: number;
  resolution_type: string;
  winning_arguments: string[];
  failed_arguments: string[];
  effective_evidence: string[];
  key_leverage_points: string[];
  notes: string;
}

const COMMON_ARGUMENTS = [
  'Code upgrade requirements',
  'Manufacturer specifications',
  'Matching clause',
  'Prompt pay violation',
  'Bad faith indicators',
  'Improper denial basis',
  'Weather event documentation',
  'Expert opinion',
  'Photo evidence',
  'Building code citations'
];

const COMMON_EVIDENCE = [
  'Contractor estimate',
  'Engineer report',
  'Moisture report',
  'Photo matrix',
  'Weather history',
  'Building permits',
  'Manufacturer specs',
  'Code citations',
  'Timeline documentation',
  'Communications log'
];

export const ClaimOutcomeCapture = ({ claimId, claim, isOpen, onClose }: ClaimOutcomeCaptureProps) => {
  const [loading, setLoading] = useState(false);
  const [existingOutcome, setExistingOutcome] = useState<any>(null);
  const [formData, setFormData] = useState<OutcomeData>({
    final_settlement: 0,
    initial_estimate: 0,
    resolution_type: 'settled',
    winning_arguments: [],
    failed_arguments: [],
    effective_evidence: [],
    key_leverage_points: [],
    notes: ''
  });
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadExistingData();
    }
  }, [isOpen, claimId]);

  const loadExistingData = async () => {
    // Load existing outcome if any
    const { data: outcome } = await supabase
      .from('claim_outcomes')
      .select('*')
      .eq('claim_id', claimId)
      .single();

    if (outcome) {
      setExistingOutcome(outcome);
      setFormData({
        final_settlement: outcome.final_settlement || 0,
        initial_estimate: outcome.initial_estimate || 0,
        resolution_type: outcome.resolution_type || 'settled',
        winning_arguments: Array.isArray(outcome.winning_arguments) ? outcome.winning_arguments as string[] : [],
        failed_arguments: Array.isArray(outcome.failed_arguments) ? outcome.failed_arguments as string[] : [],
        effective_evidence: Array.isArray(outcome.effective_evidence) ? outcome.effective_evidence as string[] : [],
        key_leverage_points: Array.isArray(outcome.key_leverage_points) ? outcome.key_leverage_points as string[] : [],
        notes: outcome.notes || ''
      });
    } else {
      // Load from settlement data
      const { data: settlement } = await supabase
        .from('claim_settlements')
        .select('*')
        .eq('claim_id', claimId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (settlement) {
        setFormData(prev => ({
          ...prev,
          final_settlement: settlement.total_settlement || 0,
          initial_estimate: settlement.estimate_amount || 0
        }));
      }
    }
  };

  const toggleArgument = (arg: string, type: 'winning' | 'failed') => {
    const field = type === 'winning' ? 'winning_arguments' : 'failed_arguments';
    const current = formData[field];
    
    if (current.includes(arg)) {
      setFormData(prev => ({
        ...prev,
        [field]: current.filter(a => a !== arg)
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: [...current, arg]
      }));
    }
  };

  const toggleEvidence = (evidence: string) => {
    const current = formData.effective_evidence;
    
    if (current.includes(evidence)) {
      setFormData(prev => ({
        ...prev,
        effective_evidence: current.filter(e => e !== evidence)
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        effective_evidence: [...current, evidence]
      }));
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const recoveryPercentage = formData.initial_estimate > 0 
        ? Math.round((formData.final_settlement / formData.initial_estimate) * 100)
        : null;

      const daysToSettlement = claim?.created_at 
        ? Math.floor((Date.now() - new Date(claim.created_at).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      const outcomeData = {
        claim_id: claimId,
        final_settlement: formData.final_settlement,
        initial_estimate: formData.initial_estimate,
        resolution_type: formData.resolution_type,
        resolution_date: new Date().toISOString(),
        days_to_final_settlement: daysToSettlement,
        recovery_percentage: recoveryPercentage,
        winning_arguments: formData.winning_arguments,
        failed_arguments: formData.failed_arguments,
        effective_evidence: formData.effective_evidence,
        key_leverage_points: formData.key_leverage_points,
        notes: formData.notes,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('claim_outcomes')
        .upsert(outcomeData, { onConflict: 'claim_id' });

      if (error) throw error;

      toast({
        title: "Outcome Captured",
        description: "This data will help improve future claim recommendations"
      });

      onClose();
    } catch (error: any) {
      toast({
        title: "Error Saving Outcome",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const variance = formData.final_settlement - formData.initial_estimate;
  const variancePercent = formData.initial_estimate > 0 
    ? ((variance / formData.initial_estimate) * 100).toFixed(1) 
    : '0';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Capture Claim Outcome
          </DialogTitle>
          <DialogDescription>
            Record what worked on this claim to improve future recommendations
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6 py-4">
            {/* Financial Outcome */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Financial Outcome
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Initial Estimate</Label>
                  <Input
                    type="number"
                    value={formData.initial_estimate}
                    onChange={e => setFormData(prev => ({ ...prev, initial_estimate: parseFloat(e.target.value) || 0 }))}
                    placeholder="$0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Final Settlement</Label>
                  <Input
                    type="number"
                    value={formData.final_settlement}
                    onChange={e => setFormData(prev => ({ ...prev, final_settlement: parseFloat(e.target.value) || 0 }))}
                    placeholder="$0.00"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                <div className="flex-1">
                  <span className="text-sm text-muted-foreground">Settlement Variance:</span>
                  <span className={`ml-2 font-bold ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {variance >= 0 ? '+' : ''}{variance.toLocaleString()} ({variancePercent}%)
                  </span>
                </div>
              </div>
            </div>

            {/* Winning Arguments */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Arguments That Worked
              </h3>
              <div className="flex flex-wrap gap-2">
                {COMMON_ARGUMENTS.map(arg => (
                  <Badge
                    key={arg}
                    variant={formData.winning_arguments.includes(arg) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleArgument(arg, 'winning')}
                  >
                    {arg}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Failed Arguments */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-600" />
                Arguments That Didn't Work
              </h3>
              <div className="flex flex-wrap gap-2">
                {COMMON_ARGUMENTS.map(arg => (
                  <Badge
                    key={arg}
                    variant={formData.failed_arguments.includes(arg) ? 'destructive' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleArgument(arg, 'failed')}
                  >
                    {arg}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Effective Evidence */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                Most Effective Evidence
              </h3>
              <div className="flex flex-wrap gap-2">
                {COMMON_EVIDENCE.map(evidence => (
                  <Badge
                    key={evidence}
                    variant={formData.effective_evidence.includes(evidence) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleEvidence(evidence)}
                  >
                    {evidence}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Key Takeaways */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-yellow-600" />
                Key Takeaways / Notes
              </h3>
              <Textarea
                value={formData.notes}
                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="What would you do differently? What was the turning point?"
                className="min-h-[100px]"
              />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save Outcome
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
