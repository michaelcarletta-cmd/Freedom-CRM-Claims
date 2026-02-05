 import { Badge } from "@/components/ui/badge";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import { 
   CheckCircle2, 
   XCircle, 
   AlertTriangle, 
   Copy, 
   AlertCircle,
   ArrowUp,
   ArrowDown,
   HelpCircle
 } from "lucide-react";
 import { toast } from "sonner";
 import { cn } from "@/lib/utils";
 import { CausationResult, CausationFormData } from "./types";
 import { PERILS } from "./indicators";
 
 interface CausationResultsProps {
   result: CausationResult;
   formData: CausationFormData;
   claimNumber?: string;
 }
 
 export function CausationResults({ result, formData, claimNumber }: CausationResultsProps) {
   const perilLabel = PERILS.find(p => p.value === formData.perilTested)?.label || formData.perilTested;
 
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
       case 'not_supported': return <XCircle className="h-5 w-5 text-red-600" />;
       default: return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
     }
   };
 
   const getDecisionLabel = (decision: string) => {
     switch (decision) {
       case 'supported': return 'Causation Supported';
       case 'not_supported': return 'Causation Not Supported';
       default: return 'Indeterminate';
     }
   };
 
   const handleCopyReport = () => {
     let report = `BUT-FOR CAUSATION ANALYSIS\n`;
     report += `${'='.repeat(60)}\n\n`;
     report += `Claim: ${claimNumber || 'N/A'}\n`;
     report += `Peril Tested: ${perilLabel}\n`;
     report += `Damage Type: ${formData.damageType}\n`;
     report += `Event Date: ${formData.eventDate ? new Date(formData.eventDate).toLocaleDateString() : 'Not specified'}\n\n`;
     
     report += `${'='.repeat(60)}\n`;
     report += `DECISION: ${getDecisionLabel(result.decision).toUpperCase()}\n`;
     report += `${'='.repeat(60)}\n\n`;
     
     report += `BUT-FOR STATEMENT:\n`;
     report += `${result.butForStatement}\n\n`;
     
     report += `${result.decisionStatement}\n\n`;
     
     if (result.baselineSusceptibility) {
       report += `BASELINE SUSCEPTIBILITY:\n`;
       report += `${result.baselineSusceptibility}\n\n`;
     }
     
     report += `SCORING:\n`;
     report += `• Wind Evidence Score: ${result.scoring.windEvidenceScore}\n`;
     report += `• Alternative Cause Score: ${result.scoring.alternativeCauseScore}\n`;
     report += `• Net Score: ${result.scoring.netScore}\n\n`;
     
     if (result.topSupportingIndicators.length > 0) {
       report += `TOP SUPPORTING INDICATORS:\n`;
       result.topSupportingIndicators.forEach((i, idx) => {
         report += `${idx + 1}. ${i.label} (+${i.appliedWeight})\n`;
       });
       report += `\n`;
     }
     
     if (result.topOpposingIndicators.length > 0) {
       report += `TOP OPPOSING INDICATORS:\n`;
       result.topOpposingIndicators.forEach((i, idx) => {
         report += `${idx + 1}. ${i.label} (-${i.appliedWeight})\n`;
       });
       report += `\n`;
     }
     
     if (result.evidenceGaps.length > 0) {
       report += `EVIDENCE GAPS (Unknown/Not Documented):\n`;
       result.evidenceGaps.forEach(gap => {
         report += `• ${gap}\n`;
       });
       report += `\n`;
     }
     
     if (result.whatWouldChange.length > 0) {
       report += `WHAT WOULD CHANGE THE DECISION:\n`;
       result.whatWouldChange.forEach(item => {
         report += `• ${item}\n`;
       });
       report += `\n`;
     }
     
     report += `${'='.repeat(60)}\n`;
     report += `Analysis Date: ${new Date().toLocaleDateString()}\n`;
     report += `Note: Uses cautious insurance language. Unknown indicators are NOT treated as evidence against causation.\n`;
     
     navigator.clipboard.writeText(report);
     toast.success('Causation report copied to clipboard');
   };
 
   return (
     <div className="space-y-4">
       {/* Decision Header */}
       <div className={cn("p-4 rounded-lg border", getDecisionColor(result.decision))}>
         <div className="flex items-center gap-3">
           {getDecisionIcon(result.decision)}
           <div className="flex-1">
             <h3 className="font-semibold text-lg">{getDecisionLabel(result.decision)}</h3>
             <p className="text-sm mt-1">{result.butForStatement}</p>
           </div>
           <Button variant="outline" size="sm" onClick={handleCopyReport}>
             <Copy className="h-4 w-4 mr-1" />
             Copy Report
           </Button>
         </div>
       </div>
 
       {/* Minimum Evidence Status */}
       {!result.minimumEvidenceMet && (
         <Card className="border-yellow-500/30 bg-yellow-500/5">
           <CardHeader className="pb-2">
             <CardTitle className="text-sm flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
               <AlertCircle className="h-4 w-4" />
               Minimum Evidence Requirement Not Met
             </CardTitle>
           </CardHeader>
           <CardContent>
             <ul className="text-xs space-y-1 text-muted-foreground">
               {result.minimumEvidenceDetails.map((detail, i) => (
                 <li key={i}>{detail}</li>
               ))}
             </ul>
           </CardContent>
         </Card>
       )}
 
       {/* Decision Statement */}
       <Card>
         <CardContent className="pt-4">
           <p className="text-sm">{result.decisionStatement}</p>
           {result.baselineSusceptibility && (
             <p className="text-sm text-muted-foreground mt-2 italic">
               {result.baselineSusceptibility}
             </p>
           )}
         </CardContent>
       </Card>
 
       {/* Scoring Summary */}
       <div className="grid gap-3 md:grid-cols-3">
         <Card className="bg-green-500/5 border-green-500/20">
           <CardContent className="pt-4 text-center">
             <ArrowUp className="h-5 w-5 mx-auto text-green-600 mb-1" />
             <p className="text-2xl font-bold text-green-700 dark:text-green-400">
               {result.scoring.windEvidenceScore}
             </p>
             <p className="text-xs text-muted-foreground">Wind Evidence Score</p>
           </CardContent>
         </Card>
         <Card className="bg-red-500/5 border-red-500/20">
           <CardContent className="pt-4 text-center">
             <ArrowDown className="h-5 w-5 mx-auto text-red-600 mb-1" />
             <p className="text-2xl font-bold text-red-700 dark:text-red-400">
               {result.scoring.alternativeCauseScore}
             </p>
             <p className="text-xs text-muted-foreground">Alternative Cause Score</p>
           </CardContent>
         </Card>
         <Card className="border-primary/20">
           <CardContent className="pt-4 text-center">
             <p className="text-2xl font-bold">{result.scoring.netScore}</p>
             <p className="text-xs text-muted-foreground">Net Score</p>
           </CardContent>
         </Card>
       </div>
 
       <div className="grid gap-4 md:grid-cols-2">
         {/* Top Supporting Indicators */}
         <Card>
           <CardHeader className="pb-2">
             <CardTitle className="text-sm flex items-center gap-2">
               <CheckCircle2 className="h-4 w-4 text-green-600" />
               Top Supporting Indicators
             </CardTitle>
           </CardHeader>
           <CardContent>
             {result.topSupportingIndicators.length > 0 ? (
               <ul className="space-y-2">
                 {result.topSupportingIndicators.map((ind, i) => (
                   <li key={ind.id} className="flex items-start gap-2 text-sm">
                     <Badge variant="outline" className="bg-green-500/10 text-green-700 text-xs">
                       +{ind.appliedWeight}
                     </Badge>
                     <span>{ind.label}</span>
                   </li>
                 ))}
               </ul>
             ) : (
               <p className="text-sm text-muted-foreground">No supporting indicators documented</p>
             )}
           </CardContent>
         </Card>
 
         {/* Top Opposing Indicators */}
         <Card>
           <CardHeader className="pb-2">
             <CardTitle className="text-sm flex items-center gap-2">
               <XCircle className="h-4 w-4 text-red-600" />
               Top Opposing Indicators
             </CardTitle>
           </CardHeader>
           <CardContent>
             {result.topOpposingIndicators.length > 0 ? (
               <ul className="space-y-2">
                 {result.topOpposingIndicators.map((ind, i) => (
                   <li key={ind.id} className="flex items-start gap-2 text-sm">
                     <Badge variant="outline" className="bg-red-500/10 text-red-700 text-xs">
                       -{ind.appliedWeight}
                     </Badge>
                     <span>{ind.label}</span>
                   </li>
                 ))}
               </ul>
             ) : (
               <p className="text-sm text-muted-foreground">No opposing indicators documented</p>
             )}
           </CardContent>
         </Card>
       </div>
 
       {/* Evidence Gaps */}
       {result.evidenceGaps.length > 0 && (
         <Card className="border-yellow-500/20">
           <CardHeader className="pb-2">
             <CardTitle className="text-sm flex items-center gap-2">
               <HelpCircle className="h-4 w-4 text-yellow-600" />
               Evidence Gaps (Unknown / Not Documented)
             </CardTitle>
           </CardHeader>
           <CardContent>
             <p className="text-xs text-muted-foreground mb-2">
               These items are NOT penalized—unknown information is never treated as evidence against causation.
             </p>
             <ScrollArea className="max-h-32">
               <ul className="space-y-1">
                 {result.evidenceGaps.map((gap, i) => (
                   <li key={i} className="text-sm text-yellow-700 dark:text-yellow-400 flex items-start gap-2">
                     <AlertTriangle className="h-3 w-3 mt-1 flex-shrink-0" />
                     {gap}
                   </li>
                 ))}
               </ul>
             </ScrollArea>
           </CardContent>
         </Card>
       )}
 
       {/* What Would Change */}
       {result.whatWouldChange.length > 0 && (
         <Card className="border-primary/20">
           <CardHeader className="pb-2">
             <CardTitle className="text-sm">What Would Change the Decision</CardTitle>
           </CardHeader>
           <CardContent>
             <ul className="space-y-1">
               {result.whatWouldChange.map((item, i) => (
                 <li key={i} className="text-sm flex items-start gap-2">
                   <span className="text-primary">→</span>
                   {item}
                 </li>
               ))}
             </ul>
           </CardContent>
         </Card>
       )}
     </div>
   );
 }