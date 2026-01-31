import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Scale, 
  AlertTriangle, 
  CheckCircle2, 
  HelpCircle, 
  ChevronDown, 
  FileText, 
  Copy, 
  Loader2,
  Wind,
  Droplets,
  Flame,
  Snowflake,
  CloudLightning,
  TreeDeciduous
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DarwinButForCausationProps {
  claimId: string;
  claim: any;
}

interface RubricWeight {
  id: string;
  category: string;
  indicator_key: string;
  indicator_label: string;
  weight: number;
  description: string;
  is_active: boolean;
}

interface CausationFormData {
  perilTested: string;
  damageType: string;
  eventDate: string;
  damageNoticedDate: string;
  directionalIndicators: string[];
  collateralDamage: string[];
  patternDispersion: string;
  roofAge: string;
  shingleType: string;
  manufacturer: string;
  priorRepairs: string;
  weatherEvidence: string;
  competingCauses: string[];
  observationsNotes: string;
}

interface CausationResult {
  decision: 'supported' | 'not_supported' | 'indeterminate';
  decisionStatement: string;
  reasoning: string[];
  alternativesConsidered: { cause: string; likelihood: string; reasoning: string }[];
  evidenceGaps: string[];
  totalScore: number;
  scoreBreakdown: Record<string, { label: string; weight: number; applied: boolean }[]>;
}

const PERILS = [
  { value: 'wind', label: 'Wind', icon: Wind },
  { value: 'hail', label: 'Hail', icon: CloudLightning },
  { value: 'water', label: 'Water/Rain', icon: Droplets },
  { value: 'fire', label: 'Fire', icon: Flame },
  { value: 'ice', label: 'Ice/Snow', icon: Snowflake },
  { value: 'falling_object', label: 'Falling Object/Tree', icon: TreeDeciduous },
];

const DAMAGE_TYPES = [
  'Shingle creasing/lifting',
  'Missing shingles',
  'Granule loss',
  'Punctures/holes',
  'Flashing damage',
  'Gutter damage',
  'Siding damage',
  'Water intrusion',
  'Structural damage',
  'Other',
];

const SHINGLE_TYPES = [
  { value: '3_tab', label: '3-Tab Shingles' },
  { value: 'architectural', label: 'Architectural/Dimensional' },
  { value: 'metal', label: 'Metal Roofing' },
  { value: 'tile', label: 'Tile Roofing' },
  { value: 'slate', label: 'Slate' },
  { value: 'wood_shake', label: 'Wood Shake' },
  { value: 'unknown', label: 'Unknown' },
];

const PATTERN_OPTIONS = [
  { value: 'localized', label: 'Localized to specific area' },
  { value: 'slope_specific', label: 'Specific slope/exposure' },
  { value: 'uniform', label: 'Uniform across roof' },
  { value: 'random', label: 'Random/scattered' },
];

export const DarwinButForCausation = ({ claimId, claim }: DarwinButForCausationProps) => {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [result, setResult] = useState<CausationResult | null>(null);
  
  const [formData, setFormData] = useState<CausationFormData>({
    perilTested: '',
    damageType: '',
    eventDate: claim?.date_of_loss || '',
    damageNoticedDate: '',
    directionalIndicators: [],
    collateralDamage: [],
    patternDispersion: '',
    roofAge: '',
    shingleType: '',
    manufacturer: '',
    priorRepairs: '',
    weatherEvidence: '',
    competingCauses: [],
    observationsNotes: '',
  });

  // Fetch rubric weights
  const { data: rubricWeights = [] } = useQuery({
    queryKey: ['causation-rubric-weights'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('causation_rubric_weights')
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true });
      
      if (error) throw error;
      return data as RubricWeight[];
    },
  });

  // Fetch previous tests for this claim
  const { data: previousTests = [] } = useQuery({
    queryKey: ['causation-tests', claimId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('claim_causation_tests')
        .select('*')
        .eq('claim_id', claimId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Group weights by category
  const weightsByCategory = rubricWeights.reduce((acc, weight) => {
    if (!acc[weight.category]) acc[weight.category] = [];
    acc[weight.category].push(weight);
    return acc;
  }, {} as Record<string, RubricWeight[]>);

  const handleCheckboxChange = (field: 'directionalIndicators' | 'collateralDamage' | 'competingCauses', key: string) => {
    setFormData(prev => {
      const current = prev[field];
      if (current.includes(key)) {
        return { ...prev, [field]: current.filter(k => k !== key) };
      } else {
        return { ...prev, [field]: [...current, key] };
      }
    });
  };

  const calculateCausation = (): CausationResult => {
    let totalScore = 0;
    const scoreBreakdown: Record<string, { label: string; weight: number; applied: boolean }[]> = {};
    const reasoning: string[] = [];
    const alternativesConsidered: { cause: string; likelihood: string; reasoning: string }[] = [];
    const evidenceGaps: string[] = [];

    // Process each category
    Object.entries(weightsByCategory).forEach(([category, weights]) => {
      scoreBreakdown[category] = [];
      
      weights.forEach(w => {
        let applied = false;
        
        // Check if this indicator is selected
        if (category === 'directional' && formData.directionalIndicators.includes(w.indicator_key)) {
          applied = true;
        } else if (category === 'collateral' && formData.collateralDamage.includes(w.indicator_key)) {
          applied = true;
        } else if (category === 'pattern' && formData.patternDispersion === w.indicator_key) {
          applied = true;
        } else if (category === 'competing_cause' && formData.competingCauses.includes(w.indicator_key)) {
          applied = true;
        } else if (category === 'timeline') {
          // Calculate timeline indicator based on dates
          if (formData.eventDate && formData.damageNoticedDate) {
            const eventDate = new Date(formData.eventDate);
            const noticedDate = new Date(formData.damageNoticedDate);
            const daysDiff = Math.floor((noticedDate.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24));
            
            if (w.indicator_key === 'immediate_notice' && daysDiff <= 1) applied = true;
            else if (w.indicator_key === 'delayed_notice' && daysDiff > 1 && daysDiff <= 7) applied = true;
            else if (w.indicator_key === 'late_notice' && daysDiff > 7) applied = true;
          }
          if (formData.competingCauses.includes('pre_existing') && w.indicator_key === 'pre_existing') {
            applied = true;
          }
        } else if (category === 'roof_condition') {
          const age = parseInt(formData.roofAge) || 0;
          if (w.indicator_key === 'new_roof' && age < 5) applied = true;
          else if (w.indicator_key === 'mid_life_roof' && age >= 5 && age < 15) applied = true;
          else if (w.indicator_key === 'aging_roof' && age >= 15 && age < 20) applied = true;
          else if (w.indicator_key === 'end_of_life' && age >= 20) applied = true;
          
          if (w.indicator_key === 'architectural_shingles' && formData.shingleType === 'architectural') applied = true;
          if (w.indicator_key === '3_tab_shingles' && formData.shingleType === '3_tab') applied = true;
        }
        
        if (applied) {
          totalScore += w.weight;
          
          // Generate reasoning
          if (w.weight > 0) {
            reasoning.push(`${w.indicator_label} supports ${formData.perilTested} causation (+${w.weight} points)`);
          } else if (w.weight < 0) {
            reasoning.push(`${w.indicator_label} suggests alternative causation (${w.weight} points)`);
          }
        }
        
        scoreBreakdown[category].push({
          label: w.indicator_label,
          weight: w.weight,
          applied,
        });
      });
    });

    // Process competing causes for alternatives
    formData.competingCauses.forEach(cause => {
      const weight = rubricWeights.find(w => w.indicator_key === cause);
      if (weight) {
        const absWeight = Math.abs(weight.weight);
        let likelihood = 'Low';
        if (absWeight >= 15) likelihood = 'High';
        else if (absWeight >= 10) likelihood = 'Moderate';
        
        alternativesConsidered.push({
          cause: weight.indicator_label,
          likelihood,
          reasoning: weight.description || 'Identified as potential alternative cause',
        });
      }
    });

    // Identify evidence gaps
    if (!formData.eventDate) evidenceGaps.push('Date/time of alleged event not specified');
    if (!formData.damageNoticedDate) evidenceGaps.push('Date damage was first noticed not specified');
    if (formData.directionalIndicators.length === 0) evidenceGaps.push('No directional indicators documented');
    if (formData.collateralDamage.length === 0) evidenceGaps.push('No collateral damage documented');
    if (!formData.patternDispersion) evidenceGaps.push('Damage pattern/dispersion not characterized');
    if (!formData.roofAge) evidenceGaps.push('Roof age unknown');
    if (!formData.weatherEvidence) evidenceGaps.push('Weather/event documentation not provided');
    if (formData.perilTested === 'wind' && !formData.directionalIndicators.some(i => 
      ['lifted_tabs', 'missing_shingles_directional', 'debris_pattern'].includes(i)
    )) {
      evidenceGaps.push('Wind damage typically requires directional indicators - consider documenting');
    }

    // Determine decision
    let decision: 'supported' | 'not_supported' | 'indeterminate';
    let decisionStatement: string;
    
    const perilLabel = PERILS.find(p => p.value === formData.perilTested)?.label || formData.perilTested;
    
    if (totalScore >= 20) {
      decision = 'supported';
      decisionStatement = `If not for ${perilLabel.toLowerCase()}, ${formData.damageType.toLowerCase()} would NOT have occurred. The evidence is consistent with ${perilLabel.toLowerCase()}-related damage based on ${formData.directionalIndicators.length + formData.collateralDamage.length} supporting indicators.`;
    } else if (totalScore <= -10) {
      decision = 'not_supported';
      decisionStatement = `If not for ${perilLabel.toLowerCase()}, ${formData.damageType.toLowerCase()} would likely STILL have occurred. The evidence suggests alternative causation factors are more probable.`;
    } else {
      decision = 'indeterminate';
      decisionStatement = `Insufficient evidence to conclusively determine whether ${formData.damageType.toLowerCase()} would have occurred without ${perilLabel.toLowerCase()}. Additional documentation is recommended.`;
    }

    // Limit reasoning to 8 bullets
    const limitedReasoning = reasoning.slice(0, 8);

    return {
      decision,
      decisionStatement,
      reasoning: limitedReasoning,
      alternativesConsidered,
      evidenceGaps,
      totalScore,
      scoreBreakdown,
    };
  };

  const saveMutation = useMutation({
    mutationFn: async (result: CausationResult) => {
      const { error } = await supabase
        .from('claim_causation_tests')
        .insert({
          claim_id: claimId,
          peril_tested: formData.perilTested,
          damage_type: formData.damageType,
          event_date: formData.eventDate || null,
          damage_noticed_date: formData.damageNoticedDate || null,
          directional_indicators: formData.directionalIndicators,
          collateral_damage: formData.collateralDamage,
          pattern_dispersion: formData.patternDispersion,
          roof_age: formData.roofAge ? parseInt(formData.roofAge) : null,
          shingle_type: formData.shingleType,
          manufacturer: formData.manufacturer,
          prior_repairs: formData.priorRepairs,
          weather_evidence: formData.weatherEvidence,
          competing_causes: formData.competingCauses,
          observations_notes: formData.observationsNotes,
          decision: result.decision,
          decision_statement: result.decisionStatement,
          reasoning: result.reasoning,
          alternatives_considered: result.alternativesConsidered,
          evidence_gaps: result.evidenceGaps,
          total_score: result.totalScore,
          score_breakdown: result.scoreBreakdown,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['causation-tests', claimId] });
      toast.success('Causation test saved');
    },
    onError: (error) => {
      toast.error('Failed to save test: ' + error.message);
    },
  });

  const handleRunTest = () => {
    if (!formData.perilTested || !formData.damageType) {
      toast.error('Please select a peril and damage type');
      return;
    }
    
    const calculatedResult = calculateCausation();
    setResult(calculatedResult);
    setShowResults(true);
    saveMutation.mutate(calculatedResult);
  };

  const handleCopyReport = () => {
    if (!result) return;
    
    const perilLabel = PERILS.find(p => p.value === formData.perilTested)?.label || formData.perilTested;
    
    let report = `BUT-FOR CAUSATION ANALYSIS\n`;
    report += `${'='.repeat(50)}\n\n`;
    report += `Peril Tested: ${perilLabel}\n`;
    report += `Damage Type: ${formData.damageType}\n`;
    report += `Event Date: ${formData.eventDate || 'Not specified'}\n`;
    report += `Damage Noticed: ${formData.damageNoticedDate || 'Not specified'}\n\n`;
    
    report += `DECISION: ${result.decision.toUpperCase().replace('_', ' ')}\n`;
    report += `-`.repeat(50) + `\n`;
    report += `${result.decisionStatement}\n\n`;
    
    report += `REASONING:\n`;
    result.reasoning.forEach((r, i) => {
      report += `${i + 1}. ${r}\n`;
    });
    
    if (result.alternativesConsidered.length > 0) {
      report += `\nALTERNATIVES CONSIDERED:\n`;
      result.alternativesConsidered.forEach(alt => {
        report += `• ${alt.cause} (${alt.likelihood} likelihood): ${alt.reasoning}\n`;
      });
    }
    
    if (result.evidenceGaps.length > 0) {
      report += `\nEVIDENCE GAPS:\n`;
      result.evidenceGaps.forEach(gap => {
        report += `• ${gap}\n`;
      });
    }
    
    report += `\nTotal Score: ${result.totalScore}\n`;
    report += `Analysis Date: ${new Date().toLocaleDateString()}\n`;
    
    navigator.clipboard.writeText(report);
    toast.success('Report copied to clipboard');
  };

  const getDecisionColor = (decision: string) => {
    switch (decision) {
      case 'supported': return 'bg-green-500/10 text-green-700 border-green-500/30';
      case 'not_supported': return 'bg-red-500/10 text-red-700 border-red-500/30';
      default: return 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30';
    }
  };

  const getDecisionIcon = (decision: string) => {
    switch (decision) {
      case 'supported': return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'not_supported': return <AlertTriangle className="h-5 w-5 text-red-600" />;
      default: return <HelpCircle className="h-5 w-5 text-yellow-600" />;
    }
  };

  return (
    <Card className="border-primary/20">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10 text-primary">
                  <Scale className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">But-For Causation Test</CardTitle>
                  <CardDescription className="text-xs">
                    Evaluate insurance causation: "If not for PERIL X, would DAMAGE Y have occurred?"
                  </CardDescription>
                </div>
              </div>
              <ChevronDown className={cn("h-5 w-5 transition-transform", isOpen && "rotate-180")} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Previous Tests */}
            {previousTests.length > 0 && (
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-xs font-medium mb-2">Previous Tests ({previousTests.length})</p>
                <div className="flex flex-wrap gap-2">
                  {previousTests.slice(0, 3).map((test: any) => (
                    <Badge 
                      key={test.id} 
                      variant="outline" 
                      className={cn("text-xs", getDecisionColor(test.decision))}
                    >
                      {test.peril_tested}: {test.decision?.replace('_', ' ')}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Form Section */}
            <div className="grid gap-6">
              {/* Row 1: Peril & Damage */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Peril Being Tested *</Label>
                  <Select value={formData.perilTested} onValueChange={v => setFormData(prev => ({ ...prev, perilTested: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select peril" />
                    </SelectTrigger>
                    <SelectContent>
                      {PERILS.map(peril => (
                        <SelectItem key={peril.value} value={peril.value}>
                          <div className="flex items-center gap-2">
                            <peril.icon className="h-4 w-4" />
                            {peril.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Damage Type *</Label>
                  <Select value={formData.damageType} onValueChange={v => setFormData(prev => ({ ...prev, damageType: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select damage type" />
                    </SelectTrigger>
                    <SelectContent>
                      {DAMAGE_TYPES.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 2: Timeline */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Date/Time of Alleged Event</Label>
                  <Input 
                    type="datetime-local" 
                    value={formData.eventDate} 
                    onChange={e => setFormData(prev => ({ ...prev, eventDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date Damage First Noticed</Label>
                  <Input 
                    type="datetime-local" 
                    value={formData.damageNoticedDate} 
                    onChange={e => setFormData(prev => ({ ...prev, damageNoticedDate: e.target.value }))}
                  />
                </div>
              </div>

              {/* Directional Indicators */}
              <div className="space-y-2">
                <Label>Directional Indicators</Label>
                <div className="grid gap-2 md:grid-cols-2">
                  {weightsByCategory.directional?.map(w => (
                    <div key={w.indicator_key} className="flex items-start gap-2">
                      <Checkbox 
                        id={w.indicator_key}
                        checked={formData.directionalIndicators.includes(w.indicator_key)}
                        onCheckedChange={() => handleCheckboxChange('directionalIndicators', w.indicator_key)}
                      />
                      <label htmlFor={w.indicator_key} className="text-sm cursor-pointer">
                        {w.indicator_label}
                        <span className="text-xs text-muted-foreground ml-1">(+{w.weight})</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Collateral Damage */}
              <div className="space-y-2">
                <Label>Collateral Damage</Label>
                <div className="grid gap-2 md:grid-cols-2">
                  {weightsByCategory.collateral?.map(w => (
                    <div key={w.indicator_key} className="flex items-start gap-2">
                      <Checkbox 
                        id={w.indicator_key}
                        checked={formData.collateralDamage.includes(w.indicator_key)}
                        onCheckedChange={() => handleCheckboxChange('collateralDamage', w.indicator_key)}
                      />
                      <label htmlFor={w.indicator_key} className="text-sm cursor-pointer">
                        {w.indicator_label}
                        <span className="text-xs text-muted-foreground ml-1">(+{w.weight})</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pattern/Dispersion */}
              <div className="space-y-2">
                <Label>Pattern/Dispersion</Label>
                <Select value={formData.patternDispersion} onValueChange={v => setFormData(prev => ({ ...prev, patternDispersion: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select damage pattern" />
                  </SelectTrigger>
                  <SelectContent>
                    {PATTERN_OPTIONS.map(opt => {
                      const weight = weightsByCategory.pattern?.find(w => w.indicator_key === opt.value);
                      return (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label} {weight && <span className="text-xs text-muted-foreground">({weight.weight > 0 ? '+' : ''}{weight.weight})</span>}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Roof Info */}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Roof Age (years)</Label>
                  <Input 
                    type="number" 
                    placeholder="e.g., 12"
                    value={formData.roofAge} 
                    onChange={e => setFormData(prev => ({ ...prev, roofAge: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Shingle Type</Label>
                  <Select value={formData.shingleType} onValueChange={v => setFormData(prev => ({ ...prev, shingleType: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {SHINGLE_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Manufacturer</Label>
                  <Input 
                    placeholder="e.g., GAF, Owens Corning"
                    value={formData.manufacturer} 
                    onChange={e => setFormData(prev => ({ ...prev, manufacturer: e.target.value }))}
                  />
                </div>
              </div>

              {/* Prior Repairs */}
              <div className="space-y-2">
                <Label>Prior Repairs / Known Issues</Label>
                <Textarea 
                  placeholder="Document any previous repairs, maintenance, or known issues..."
                  value={formData.priorRepairs}
                  onChange={e => setFormData(prev => ({ ...prev, priorRepairs: e.target.value }))}
                  rows={2}
                />
              </div>

              {/* Weather Evidence */}
              <div className="space-y-2">
                <Label>Weather/Event Evidence</Label>
                <Textarea 
                  placeholder="Reported wind speeds, storm reports, NOAA data, photos, adjuster notes..."
                  value={formData.weatherEvidence}
                  onChange={e => setFormData(prev => ({ ...prev, weatherEvidence: e.target.value }))}
                  rows={3}
                />
              </div>

              {/* Competing Causes */}
              <div className="space-y-2">
                <Label>Competing Causes Checklist</Label>
                <div className="grid gap-2 md:grid-cols-2">
                  {weightsByCategory.competing_cause?.map(w => (
                    <div key={w.indicator_key} className="flex items-start gap-2">
                      <Checkbox 
                        id={`competing_${w.indicator_key}`}
                        checked={formData.competingCauses.includes(w.indicator_key)}
                        onCheckedChange={() => handleCheckboxChange('competingCauses', w.indicator_key)}
                      />
                      <label htmlFor={`competing_${w.indicator_key}`} className="text-sm cursor-pointer">
                        {w.indicator_label}
                        <span className="text-xs text-red-500 ml-1">({w.weight})</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Observations Notes */}
              <div className="space-y-2">
                <Label>Additional Observations</Label>
                <Textarea 
                  placeholder="Any other relevant observations or notes..."
                  value={formData.observationsNotes}
                  onChange={e => setFormData(prev => ({ ...prev, observationsNotes: e.target.value }))}
                  rows={2}
                />
              </div>

              {/* Run Test Button */}
              <Button onClick={handleRunTest} disabled={saveMutation.isPending} className="w-full">
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Running Analysis...
                  </>
                ) : (
                  <>
                    <Scale className="h-4 w-4 mr-2" />
                    Run But-For Causation Test
                  </>
                )}
              </Button>
            </div>

            {/* Results Section */}
            {showResults && result && (
              <div className="space-y-4 pt-4 border-t">
                {/* Decision Banner */}
                <div className={cn(
                  "p-4 rounded-lg border flex items-start gap-3",
                  getDecisionColor(result.decision)
                )}>
                  {getDecisionIcon(result.decision)}
                  <div>
                    <p className="font-semibold">
                      {result.decision === 'supported' && 'But-For Causation Supported'}
                      {result.decision === 'not_supported' && 'But-For Causation Not Supported'}
                      {result.decision === 'indeterminate' && 'Indeterminate — More Evidence Needed'}
                    </p>
                    <p className="text-sm mt-1">{result.decisionStatement}</p>
                    <p className="text-xs mt-2 opacity-70">Total Score: {result.totalScore}</p>
                  </div>
                </div>

                {/* Reasoning */}
                <div className="space-y-2">
                  <p className="font-medium text-sm">Reasoning</p>
                  <ul className="space-y-1">
                    {result.reasoning.map((r, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-muted-foreground">•</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Alternatives */}
                {result.alternativesConsidered.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-medium text-sm">Alternatives Considered</p>
                    <div className="space-y-2">
                      {result.alternativesConsidered.map((alt, i) => (
                        <div key={i} className="p-2 bg-muted/30 rounded text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{alt.cause}</span>
                            <Badge variant="outline" className="text-xs">
                              {alt.likelihood} likelihood
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{alt.reasoning}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Evidence Gaps */}
                {result.evidenceGaps.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-medium text-sm">Evidence Gaps</p>
                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                      <ul className="space-y-1">
                        {result.evidenceGaps.map((gap, i) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
                            {gap}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Explain My Result Accordion */}
                <Accordion type="single" collapsible>
                  <AccordionItem value="rubric">
                    <AccordionTrigger className="text-sm">Explain My Result (Score Breakdown)</AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4">
                        {Object.entries(result.scoreBreakdown).map(([category, items]) => (
                          <div key={category}>
                            <p className="font-medium text-xs uppercase text-muted-foreground mb-2">
                              {category.replace('_', ' ')}
                            </p>
                            <div className="space-y-1">
                              {items.map((item, i) => (
                                <div 
                                  key={i} 
                                  className={cn(
                                    "flex justify-between text-xs p-1.5 rounded",
                                    item.applied && "bg-primary/10"
                                  )}
                                >
                                  <span className={cn(!item.applied && "text-muted-foreground")}>
                                    {item.label}
                                  </span>
                                  <span className={cn(
                                    "font-mono",
                                    item.applied && item.weight > 0 && "text-green-600",
                                    item.applied && item.weight < 0 && "text-red-600",
                                    !item.applied && "text-muted-foreground"
                                  )}>
                                    {item.applied ? (item.weight > 0 ? `+${item.weight}` : item.weight) : '—'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        
                        <div className="pt-2 border-t flex justify-between font-medium">
                          <span>Total Score</span>
                          <span className={cn(
                            "font-mono",
                            result.totalScore >= 20 && "text-green-600",
                            result.totalScore <= -10 && "text-red-600"
                          )}>
                            {result.totalScore}
                          </span>
                        </div>
                        
                        <div className="text-xs text-muted-foreground p-2 bg-muted/30 rounded">
                          <p><strong>Thresholds:</strong></p>
                          <p>≥20: Causation Supported</p>
                          <p>≤-10: Causation Not Supported</p>
                          <p>-9 to 19: Indeterminate</p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {/* Export Buttons */}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopyReport}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Report
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default DarwinButForCausation;
