 import { useState } from "react";
 import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { Button } from "@/components/ui/button";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { Textarea } from "@/components/ui/textarea";
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
 import { Badge } from "@/components/ui/badge";
 import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
 import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
 import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
 import { 
   Scale, 
   ChevronDown, 
   Loader2,
   Info
 } from "lucide-react";
 import { toast } from "sonner";
 import { cn } from "@/lib/utils";
 import { CausationBlameCounterSection } from "./CausationBlameCounterSection";
 
 // New modular imports
 import { CausationFormData, CausationResult, IndicatorValue } from "./causation/types";
 import { 
   PERILS, 
   DAMAGE_TYPES, 
   SHINGLE_TYPES,
   PERIL_SUPPORTING_INDICATORS,
   ALTERNATIVE_CAUSE_INDICATORS
 } from "./causation/indicators";
 import { calculateCausation } from "./causation/calculateCausation";
 import { IndicatorInput } from "./causation/IndicatorInput";
 import { CausationResults } from "./causation/CausationResults";
import { CausationPhotoAnalysis } from "./causation/CausationPhotoAnalysis";

interface DarwinButForCausationProps {
  claimId: string;
  claim: any;
}

export const DarwinButForCausation = ({ claimId, claim }: DarwinButForCausationProps) => {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [result, setResult] = useState<CausationResult | null>(null);
  
  const [formData, setFormData] = useState<CausationFormData>({
    perilTested: '',
    damageTypes: [],
    eventDate: claim?.date_of_loss || '',
    damageNoticedDate: '',
     indicators: {},
    roofAge: '',
    shingleType: '',
    manufacturer: '',
    priorRepairs: '',
    weatherEvidence: '',
    observationsNotes: '',
    carrierBlameTactics: [],
    blameEvidenceChecked: {},
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

   // Handle indicator state changes
   const handleIndicatorChange = (id: string, value: IndicatorValue) => {
     setFormData(prev => ({
       ...prev,
       indicators: {
         ...prev.indicators,
         [id]: value,
       },
     }));
  };

  // Handle bulk indicator updates from photo analysis
  const handlePhotoIndicatorsDetected = (indicators: Record<string, IndicatorValue>) => {
    setFormData(prev => ({
      ...prev,
      indicators: {
        ...prev.indicators,
        ...indicators,
      },
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async (result: CausationResult) => {
      const { error } = await supabase
        .from('claim_causation_tests')
       .insert([{
          claim_id: claimId,
          peril_tested: formData.perilTested,
          damage_type: formData.damageTypes.join(', '),
          event_date: formData.eventDate || null,
          damage_noticed_date: formData.damageNoticedDate || null,
           directional_indicators: Object.keys(formData.indicators).filter(k => formData.indicators[k]?.state === 'present'),
           collateral_damage: [],
           pattern_dispersion: null,
          roof_age: formData.roofAge ? parseInt(formData.roofAge) : null,
          shingle_type: formData.shingleType,
          manufacturer: formData.manufacturer,
          prior_repairs: formData.priorRepairs,
          weather_evidence: formData.weatherEvidence,
           competing_causes: [],
          observations_notes: formData.observationsNotes,
          decision: result.decision,
          decision_statement: result.decisionStatement,
           reasoning: result.topSupportingIndicators.map(i => `${i.label} (+${i.appliedWeight})`),
           alternatives_considered: result.topOpposingIndicators.map(i => ({ 
             cause: i.label, 
             likelihood: 'Documented', 
             reasoning: `Evidence documented (-${i.appliedWeight})` 
           })),
          evidence_gaps: result.evidenceGaps,
           total_score: result.scoring.netScore,
           score_breakdown: JSON.parse(JSON.stringify({ 
             windEvidence: result.scoring.windEvidenceScore, 
             alternativeCause: result.scoring.alternativeCauseScore,
             indicatorBreakdown: result.indicatorBreakdown
           })),
       }]);
      
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
    if (!formData.perilTested || formData.damageTypes.length === 0) {
      toast.error('Please select a peril and at least one damage type');
      return;
    }
    
     const calculatedResult = calculateCausation(formData);
    setResult(calculatedResult);
    setShowResults(true);
    saveMutation.mutate(calculatedResult);
  };

  const getDecisionColor = (decision: string) => {
    switch (decision) {
      case 'supported': return 'bg-green-500/10 text-green-700 border-green-500/30';
      case 'not_supported': return 'bg-red-500/10 text-red-700 border-red-500/30';
      default: return 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30';
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

            {/* AI Photo Analysis Section - Always visible */}
            <CausationPhotoAnalysis
              claimId={claimId}
              perilTested={formData.perilTested || 'wind'}
              onIndicatorsDetected={handlePhotoIndicatorsDetected}
              currentIndicators={formData.indicators}
            />

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
                           {peril.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Damage Type(s) *</Label>
                  <div className="flex flex-wrap gap-2 p-3 border rounded-md bg-background min-h-[42px]">
                    {DAMAGE_TYPES.map(type => {
                      const isSelected = formData.damageTypes.includes(type);
                      return (
                        <Badge
                          key={type}
                          variant={isSelected ? "default" : "outline"}
                          className={cn(
                            "cursor-pointer transition-colors",
                            isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                          )}
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              damageTypes: isSelected
                                ? prev.damageTypes.filter(t => t !== type)
                                : [...prev.damageTypes, type]
                            }));
                          }}
                        >
                          {type}
                        </Badge>
                      );
                    })}
                  </div>
                  {formData.damageTypes.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Selected: {formData.damageTypes.join(', ')}
                    </p>
                  )}
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

               {/* Three-State Indicator System */}
               <div className="space-y-4">
                 <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                   <Info className="h-4 w-4 text-muted-foreground" />
                   <p className="text-xs text-muted-foreground">
                     <strong>Indicator States:</strong> Yes (observed/documented) • No (explicitly not present) • ? (unknown/not evaluated). 
                     <span className="text-yellow-600 dark:text-yellow-400 font-medium"> Unknown indicators are NEVER penalized.</span>
                   </p>
                 </div>
 
                 <Accordion type="multiple" defaultValue={['core_evidence', 'directional']} className="space-y-2">
                   {/* Core Evidence Indicators */}
                   <AccordionItem value="core_evidence" className="border rounded-lg">
                     <AccordionTrigger className="px-4 hover:no-underline">
                       <div className="flex items-center gap-2">
                         <span className="font-medium">Core Evidence (Minimum Requirement)</span>
                         <Badge variant="outline" className="bg-primary/10 text-primary text-xs">
                           At least 1 required for "Supported"
                         </Badge>
                       </div>
                     </AccordionTrigger>
                     <AccordionContent className="px-4 pb-4">
                       <div className="space-y-2">
                         {PERIL_SUPPORTING_INDICATORS.filter(i => i.category === 'core_evidence').map(indicator => (
                           <IndicatorInput
                             key={indicator.id}
                             id={indicator.id}
                             label={indicator.label}
                             weight={indicator.weight}
                             isPositive={indicator.isPositive}
                             description={indicator.description}
                             value={formData.indicators[indicator.id]}
                             onChange={handleIndicatorChange}
                           />
                         ))}
                       </div>
                     </AccordionContent>
                   </AccordionItem>
 
                   {/* Secondary Supporting Indicators */}
                   <AccordionItem value="secondary" className="border rounded-lg">
                     <AccordionTrigger className="px-4 hover:no-underline">
                       <span className="font-medium">Secondary Supporting Indicators</span>
                     </AccordionTrigger>
                     <AccordionContent className="px-4 pb-4">
                       <div className="space-y-2">
                         {PERIL_SUPPORTING_INDICATORS.filter(i => i.category !== 'core_evidence').map(indicator => (
                           <IndicatorInput
                             key={indicator.id}
                             id={indicator.id}
                             label={indicator.label}
                             weight={indicator.weight}
                             isPositive={indicator.isPositive}
                             description={indicator.description}
                             value={formData.indicators[indicator.id]}
                             onChange={handleIndicatorChange}
                           />
                         ))}
                       </div>
                     </AccordionContent>
                   </AccordionItem>
 
                   {/* Alternative Cause Indicators */}
                   <AccordionItem value="alternative" className="border rounded-lg border-red-500/20">
                     <AccordionTrigger className="px-4 hover:no-underline">
                       <div className="flex items-center gap-2">
                         <span className="font-medium">Alternative Cause Indicators</span>
                         <Badge variant="outline" className="bg-red-500/10 text-red-700 text-xs">
                           Only mark "Yes" if affirmative evidence exists
                         </Badge>
                       </div>
                     </AccordionTrigger>
                     <AccordionContent className="px-4 pb-4">
                       <p className="text-xs text-muted-foreground mb-3">
                         Do NOT subtract points unless there is <strong>affirmative evidence</strong> of an alternative cause. 
                         Absence of documentation ≠ evidence of absence.
                       </p>
                       <div className="space-y-2">
                         {ALTERNATIVE_CAUSE_INDICATORS.map(indicator => (
                           <IndicatorInput
                             key={indicator.id}
                             id={indicator.id}
                             label={indicator.label}
                             weight={indicator.weight}
                             isPositive={indicator.isPositive}
                             description={indicator.description}
                             value={formData.indicators[indicator.id]}
                             onChange={handleIndicatorChange}
                           />
                         ))}
                       </div>
                     </AccordionContent>
                   </AccordionItem>
                 </Accordion>
               </div>
 
               {/* Baseline Susceptibility Context (not scored) */}
               <Accordion type="single" collapsible className="border rounded-lg">
                 <AccordionItem value="context" className="border-0">
                   <AccordionTrigger className="px-4 hover:no-underline">
                     <div className="flex items-center gap-2">
                       <span className="font-medium">Baseline Susceptibility Context</span>
                       <Badge variant="outline" className="text-xs">
                         Contextual modifiers — not directly scored
                       </Badge>
                     </div>
                   </AccordionTrigger>
                   <AccordionContent className="px-4 pb-4 space-y-4">
                     <p className="text-xs text-muted-foreground">
                       Roof age, shingle type, and prior repairs influence the but-for explanation, 
                       but do NOT independently cause approval or denial.
                     </p>
                     
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
 
                     <div className="space-y-2">
                       <Label>Prior Repairs / Known Issues</Label>
                       <Textarea 
                         placeholder="Document any previous repairs, maintenance, or known issues..."
                         value={formData.priorRepairs}
                         onChange={e => setFormData(prev => ({ ...prev, priorRepairs: e.target.value }))}
                         rows={2}
                      />
                    </div>
 
                     <div className="space-y-2">
                       <Label>Weather/Event Evidence</Label>
                       <Textarea 
                         placeholder="Reported wind speeds, storm reports, NOAA data..."
                         value={formData.weatherEvidence}
                         onChange={e => setFormData(prev => ({ ...prev, weatherEvidence: e.target.value }))}
                         rows={2}
                      />
                    </div>
                   </AccordionContent>
                 </AccordionItem>
               </Accordion>
 
               {/* Notes */}
               <div className="space-y-2">
                 <Label>Observations / Additional Notes</Label>
                 <Textarea 
                   placeholder="Additional observations, inspector notes, or context..."
                   value={formData.observationsNotes}
                   onChange={e => setFormData(prev => ({ ...prev, observationsNotes: e.target.value }))}
                   rows={2}
                 />
              </div>

               {/* Run Test Button */}
               <div className="flex gap-2">
                 <Button 
                   onClick={handleRunTest} 
                   disabled={saveMutation.isPending}
                   className="flex-1"
                 >
                   {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                   Run But-For Causation Test
                 </Button>
              </div>

               {/* Results */}
               {showResults && result && (
                 <CausationResults 
                   result={result} 
                   formData={formData}
                   claimNumber={claim?.claim_number}
                 />
               )}
 
               {/* Carrier Blame Counter Section */}
               <Accordion type="single" collapsible>
                 <AccordionItem value="blame-counter">
                   <AccordionTrigger>
                     <span className="font-medium">Carrier Blame Counter-Arguments</span>
                   </AccordionTrigger>
                   <AccordionContent>
                     <CausationBlameCounterSection
                       selectedTactics={formData.carrierBlameTactics}
                       onTacticsChange={(tactics) => setFormData(prev => ({ ...prev, carrierBlameTactics: tactics }))}
                       onEvidenceCheck={(tacticId, evidenceItem, checked) => {
                         setFormData(prev => {
                           const current = prev.blameEvidenceChecked[tacticId] || [];
                           const updated = checked 
                             ? [...current, evidenceItem]
                             : current.filter(e => e !== evidenceItem);
                           return {
                             ...prev,
                             blameEvidenceChecked: {
                               ...prev.blameEvidenceChecked,
                               [tacticId]: updated,
                             },
                           };
                         });
                       }}
                       checkedEvidence={formData.blameEvidenceChecked}
                     />
                   </AccordionContent>
                 </AccordionItem>
               </Accordion>
             </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default DarwinButForCausation;
