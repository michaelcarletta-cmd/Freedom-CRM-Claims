 import { useState, useEffect } from "react";
 import { useMutation, useQuery } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { Button } from "@/components/ui/button";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { Badge } from "@/components/ui/badge";
 import { Checkbox } from "@/components/ui/checkbox";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import { 
   Camera, 
   Loader2, 
   CheckCircle2, 
   AlertTriangle,
   Sparkles,
   Eye,
   Wind,
   CloudRain
 } from "lucide-react";
 import { toast } from "sonner";
 import { cn } from "@/lib/utils";
 import { IndicatorValue, IndicatorState } from "./types";
 import { ALL_INDICATORS } from "./indicators";
 
 interface ClaimPhoto {
   id: string;
   file_name: string;
   file_path: string;
   category?: string;
   ai_analyzed_at?: string;
   ai_condition_rating?: string;
   ai_detected_damages?: Array<{
     type: string;
     severity: string;
     location?: string;
     notes?: string;
     consistent_with_loss_type?: boolean;
   }>;
   ai_analysis_summary?: string;
   ai_loss_type_consistency?: string;
   ai_material_type?: string;
 }
 
 interface DetectedIndicator {
   id: string;
   label: string;
   confidence: 'high' | 'medium' | 'low';
   source: string; // photo filename
   reasoning: string;
 }
 
 interface CausationPhotoAnalysisProps {
   claimId: string;
   perilTested: string;
   onIndicatorsDetected: (indicators: Record<string, IndicatorValue>) => void;
   currentIndicators: Record<string, IndicatorValue>;
 }
 
 // Map damage types from photo analysis to causation indicators
 const DAMAGE_TO_INDICATOR_MAP: Record<string, { indicatorId: string; isPositive: boolean }[]> = {
   // Directional patterns
   'directional damage': [{ indicatorId: 'directional_pattern', isPositive: true }],
   'directional pattern': [{ indicatorId: 'directional_pattern', isPositive: true }],
   'wind damage': [{ indicatorId: 'directional_pattern', isPositive: true }, { indicatorId: 'lifted_tabs', isPositive: true }],
   'lifted shingles': [{ indicatorId: 'lifted_tabs', isPositive: true }],
   'creased shingles': [{ indicatorId: 'lifted_tabs', isPositive: true }],
   'lifted/creased': [{ indicatorId: 'lifted_tabs', isPositive: true }],
   'lifted tabs': [{ indicatorId: 'lifted_tabs', isPositive: true }],
   
   // Missing/displaced materials
   'missing shingles': [{ indicatorId: 'displaced_missing_materials', isPositive: true }],
   'missing materials': [{ indicatorId: 'displaced_missing_materials', isPositive: true }],
   'displaced materials': [{ indicatorId: 'displaced_missing_materials', isPositive: true }],
   'torn shingles': [{ indicatorId: 'displaced_missing_materials', isPositive: true }],
   'exposed underlayment': [{ indicatorId: 'displaced_missing_materials', isPositive: true }],
   
   // Collateral damage
   'gutter damage': [{ indicatorId: 'collateral_same_exposure', isPositive: true }],
   'flashing damage': [{ indicatorId: 'collateral_same_exposure', isPositive: true }],
   'siding damage': [{ indicatorId: 'fence_siding_damage', isPositive: true }, { indicatorId: 'collateral_same_exposure', isPositive: true }],
   'fence damage': [{ indicatorId: 'fence_siding_damage', isPositive: true }],
   
   // Edge/ridge concentration
   'edge damage': [{ indicatorId: 'edge_damage_concentration', isPositive: true }],
   'ridge damage': [{ indicatorId: 'edge_damage_concentration', isPositive: true }],
   
   // Hail specific
   'hail damage': [{ indicatorId: 'storm_plus_localized_damage', isPositive: true }],
   'bruising': [{ indicatorId: 'storm_plus_localized_damage', isPositive: true }],
   'soft spots': [{ indicatorId: 'storm_plus_localized_damage', isPositive: true }],
   'impact damage': [{ indicatorId: 'storm_plus_localized_damage', isPositive: true }],
   'granule loss': [{ indicatorId: 'storm_plus_localized_damage', isPositive: true }],
   
   // Fresh damage indicators
   'fresh damage': [{ indicatorId: 'fresh_fractures', isPositive: true }],
   'recent damage': [{ indicatorId: 'fresh_fractures', isPositive: true }],
   'new fractures': [{ indicatorId: 'fresh_fractures', isPositive: true }],
   
   // Debris
   'debris': [{ indicatorId: 'debris_scatter_pattern', isPositive: true }],
   'debris impact': [{ indicatorId: 'debris_scatter_pattern', isPositive: true }],
   
   // Alternative causes (negative)
   'uniform wear': [{ indicatorId: 'uniform_wear_all_slopes', isPositive: false }],
   'general wear': [{ indicatorId: 'uniform_wear_all_slopes', isPositive: false }],
   'aging': [{ indicatorId: 'uniform_wear_all_slopes', isPositive: false }],
   'installation defect': [{ indicatorId: 'installation_defect_documented', isPositive: false }],
   'improper installation': [{ indicatorId: 'installation_defect_documented', isPositive: false }],
 };
 
 export const CausationPhotoAnalysis = ({
   claimId,
   perilTested,
   onIndicatorsDetected,
   currentIndicators,
 }: CausationPhotoAnalysisProps) => {
   const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
   const [detectedIndicators, setDetectedIndicators] = useState<DetectedIndicator[]>([]);
   const [isAnalyzing, setIsAnalyzing] = useState(false);
 
  // Fetch claim photos
  const { data: photos = [], isLoading: photosLoading } = useQuery({
    queryKey: ['causation-photos', claimId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('claim_photos')
        .select('id, file_name, file_path, category, ai_analyzed_at, ai_condition_rating, ai_detected_damages, ai_analysis_summary, ai_loss_type_consistency, ai_material_type')
        .eq('claim_id', claimId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ClaimPhoto[];
    },
  });
 
   // Get photo URL
   const getPhotoUrl = async (filePath: string) => {
     const { data } = await supabase.storage
       .from('claim-files')
       .createSignedUrl(filePath, 3600);
     return data?.signedUrl || '';
   };
 
   // Analyze selected photos for causation indicators
   const analyzeForCausation = async () => {
     if (selectedPhotos.length === 0) {
       toast.error('Please select at least one photo');
       return;
     }
 
     setIsAnalyzing(true);
     const foundIndicators: DetectedIndicator[] = [];
 
     try {
       // Get selected photos
       const selectedPhotoData = photos.filter(p => selectedPhotos.includes(p.id));
       
       // Process photos that need analysis
       for (const photo of selectedPhotoData) {
         // If photo hasn't been analyzed yet, trigger analysis
         if (!photo.ai_analyzed_at) {
           toast.loading(`Analyzing ${photo.file_name}...`, { id: photo.id });
           
           const { data, error } = await supabase.functions.invoke('analyze-single-photo', {
             body: { photoId: photo.id, claimId },
           });
           
           if (error) {
             console.error(`Failed to analyze ${photo.file_name}:`, error);
             toast.error(`Failed to analyze ${photo.file_name}`, { id: photo.id });
             continue;
           }
           
           toast.success(`Analyzed ${photo.file_name}`, { id: photo.id });
           
           // Update photo data with analysis results
           if (data?.analysis) {
             photo.ai_detected_damages = data.analysis.detected_damages;
             photo.ai_condition_rating = data.analysis.condition_rating;
             photo.ai_analysis_summary = data.analysis.summary;
             photo.ai_loss_type_consistency = data.analysis.loss_type_consistency;
             photo.ai_analyzed_at = data.analysis.analyzed_at;
           }
         }
         
         // Extract indicators from detected damages
         if (photo.ai_detected_damages && Array.isArray(photo.ai_detected_damages)) {
           for (const damage of photo.ai_detected_damages) {
             const damageType = damage.type?.toLowerCase() || '';
             
             // Check each mapping
             for (const [pattern, indicators] of Object.entries(DAMAGE_TO_INDICATOR_MAP)) {
               if (damageType.includes(pattern)) {
                 for (const indicator of indicators) {
                   // Check if we already have this indicator
                   const existing = foundIndicators.find(i => i.id === indicator.indicatorId);
                   if (!existing) {
                     const indicatorDef = ALL_INDICATORS.find(i => i.id === indicator.indicatorId);
                     if (indicatorDef) {
                       foundIndicators.push({
                         id: indicator.indicatorId,
                         label: indicatorDef.label,
                         confidence: damage.severity === 'severe' ? 'high' : damage.severity === 'moderate' ? 'medium' : 'low',
                         source: photo.file_name,
                         reasoning: `Detected "${damage.type}" - ${damage.notes || damage.location || 'visible in photo'}`,
                       });
                     }
                   }
                 }
               }
             }
             
             // Special handling for loss type consistency
             if (photo.ai_loss_type_consistency === 'consistent' && damage.consistent_with_loss_type) {
               // Boost confidence for consistent findings
               const existing = foundIndicators.find(i => i.source === photo.file_name);
               if (existing && existing.confidence === 'medium') {
                 existing.confidence = 'high';
               }
             }
           }
         }
       }
 
       setDetectedIndicators(foundIndicators);
       
       if (foundIndicators.length > 0) {
         toast.success(`Found ${foundIndicators.length} causation indicator(s) in photos`);
       } else {
         toast.info('No specific causation indicators detected. Review photos manually.');
       }
       
     } catch (error) {
       console.error('Causation photo analysis error:', error);
       toast.error('Failed to analyze photos');
     } finally {
       setIsAnalyzing(false);
     }
   };
 
   // Apply detected indicators to the form
   const applyIndicators = () => {
     const newIndicators: Record<string, IndicatorValue> = { ...currentIndicators };
     
     for (const detected of detectedIndicators) {
       // Only apply if not already set or if current is unknown
       if (!newIndicators[detected.id] || newIndicators[detected.id].state === 'unknown') {
         newIndicators[detected.id] = {
           state: 'present',
           notes: `[AI Detected] ${detected.reasoning} (${detected.source})`,
         };
       }
     }
     
     onIndicatorsDetected(newIndicators);
     toast.success(`Applied ${detectedIndicators.length} indicator(s) to the test`);
   };
 
   const togglePhoto = (photoId: string) => {
     setSelectedPhotos(prev => 
       prev.includes(photoId) 
         ? prev.filter(id => id !== photoId)
         : [...prev, photoId]
     );
   };
 
   const selectAll = () => {
     setSelectedPhotos(photos.map(p => p.id));
   };
 
   const getConditionBadge = (rating?: string) => {
     if (!rating) return null;
     const colors: Record<string, string> = {
       excellent: 'bg-green-500/10 text-green-700',
       good: 'bg-green-500/10 text-green-600',
       fair: 'bg-yellow-500/10 text-yellow-700',
       poor: 'bg-orange-500/10 text-orange-700',
       failed: 'bg-red-500/10 text-red-700',
     };
     return (
       <Badge variant="outline" className={cn("text-xs", colors[rating.toLowerCase()] || '')}>
         {rating}
       </Badge>
     );
   };
 
   const getConsistencyIcon = (consistency?: string) => {
     if (consistency === 'consistent') return <CheckCircle2 className="h-3 w-3 text-green-600" />;
     if (consistency === 'inconsistent') return <AlertTriangle className="h-3 w-3 text-red-600" />;
     return null;
   };
 
   if (photosLoading) {
     return (
       <div className="flex items-center justify-center p-4">
         <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
       </div>
     );
   }
 
   if (photos.length === 0) {
     return (
       <Card className="border-dashed">
         <CardContent className="flex flex-col items-center justify-center py-6 text-center">
           <Camera className="h-8 w-8 text-muted-foreground mb-2" />
           <p className="text-sm text-muted-foreground">No photos available</p>
           <p className="text-xs text-muted-foreground">Upload photos in the Photos tab first</p>
         </CardContent>
       </Card>
     );
   }
 
   return (
     <Card className="border-primary/20">
       <CardHeader className="pb-3">
         <div className="flex items-center justify-between">
           <div className="flex items-center gap-2">
             <Sparkles className="h-4 w-4 text-primary" />
             <CardTitle className="text-sm">AI Photo Analysis for Causation</CardTitle>
           </div>
           <Badge variant="outline" className="text-xs">
             {selectedPhotos.length} of {photos.length} selected
           </Badge>
         </div>
         <CardDescription className="text-xs">
           Select photos and let Darwin analyze them for causation indicators like directional patterns, displaced materials, and collateral damage.
         </CardDescription>
       </CardHeader>
       
       <CardContent className="space-y-4">
         {/* Photo Selection */}
         <div className="space-y-2">
           <div className="flex items-center justify-between">
             <p className="text-xs font-medium">Select Photos to Analyze</p>
             <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-7">
               Select All
             </Button>
           </div>
           
           <ScrollArea className="h-40 rounded-md border p-2">
             <div className="space-y-1">
               {photos.map((photo) => (
                 <div 
                   key={photo.id}
                   className={cn(
                     "flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors",
                     selectedPhotos.includes(photo.id) && "bg-primary/5 border border-primary/20"
                   )}
                   onClick={() => togglePhoto(photo.id)}
                 >
                   <Checkbox 
                     checked={selectedPhotos.includes(photo.id)}
                     onCheckedChange={() => togglePhoto(photo.id)}
                   />
                   <div className="flex-1 min-w-0">
                     <p className="text-xs font-medium truncate">{photo.file_name}</p>
                     <div className="flex items-center gap-2 mt-0.5">
                       {photo.category && (
                         <span className="text-xs text-muted-foreground">{photo.category}</span>
                       )}
                       {getConditionBadge(photo.ai_condition_rating)}
                       {getConsistencyIcon(photo.ai_loss_type_consistency)}
                       {photo.ai_analyzed_at && (
                         <span title="Previously analyzed">
                           <Eye className="h-3 w-3 text-muted-foreground" />
                         </span>
                       )}
                     </div>
                   </div>
                 </div>
               ))}
             </div>
           </ScrollArea>
         </div>
 
         {/* Analyze Button */}
         <Button 
           onClick={analyzeForCausation}
           disabled={isAnalyzing || selectedPhotos.length === 0}
           className="w-full"
           variant="outline"
         >
           {isAnalyzing ? (
             <>
               <Loader2 className="h-4 w-4 mr-2 animate-spin" />
               Analyzing Photos...
             </>
           ) : (
             <>
               <Sparkles className="h-4 w-4 mr-2" />
               Analyze for Causation Indicators
             </>
           )}
         </Button>
 
         {/* Detected Indicators */}
         {detectedIndicators.length > 0 && (
           <div className="space-y-3 pt-2 border-t">
             <div className="flex items-center justify-between">
               <p className="text-xs font-medium text-green-700">
                 ✓ Detected {detectedIndicators.length} Indicator(s)
               </p>
               <Button size="sm" onClick={applyIndicators} className="h-7 text-xs">
                 Apply to Test
               </Button>
             </div>
             
             <div className="space-y-2">
               {detectedIndicators.map((indicator, idx) => (
                 <div 
                   key={`${indicator.id}-${idx}`}
                   className="p-2 rounded-md bg-green-500/5 border border-green-500/20"
                 >
                   <div className="flex items-center gap-2">
                     {perilTested === 'wind' && <Wind className="h-3 w-3 text-primary" />}
                     {perilTested === 'hail' && <CloudRain className="h-3 w-3 text-primary" />}
                     <span className="text-xs font-medium">{indicator.label}</span>
                     <Badge 
                       variant="outline" 
                       className={cn(
                         "text-xs",
                         indicator.confidence === 'high' && "bg-green-500/10 text-green-700",
                         indicator.confidence === 'medium' && "bg-yellow-500/10 text-yellow-700",
                         indicator.confidence === 'low' && "bg-muted text-muted-foreground"
                       )}
                     >
                       {indicator.confidence} confidence
                     </Badge>
                   </div>
                   <p className="text-xs text-muted-foreground mt-1">
                     {indicator.reasoning}
                   </p>
                   <p className="text-xs text-muted-foreground italic">
                     Source: {indicator.source}
                   </p>
                 </div>
               ))}
             </div>
           </div>
         )}
       </CardContent>
     </Card>
   );
 };
 
 export default CausationPhotoAnalysis;