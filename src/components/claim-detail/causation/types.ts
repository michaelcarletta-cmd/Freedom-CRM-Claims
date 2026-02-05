 // Three-state indicator model for But-For Causation Test
 export type IndicatorState = 'present' | 'absent' | 'unknown';
 
 export interface IndicatorValue {
   state: IndicatorState;
   notes?: string;
 }
 
 export interface CausationIndicator {
   id: string;
   category: string;
   label: string;
   weight: number; // Can be positive (supports peril) or negative (supports alternative)
   description?: string;
   isPositive: boolean; // true = evidence for peril, false = evidence against
 }
 
export interface CausationFormData {
  perilTested: string;
  damageTypes: string[]; // Changed to array for multi-select
  eventDate: string;
   damageNoticedDate: string;
   // Three-state indicator values
   indicators: Record<string, IndicatorValue>;
   // Contextual modifiers (not scored directly)
   roofAge: string;
   shingleType: string;
   manufacturer: string;
   priorRepairs: string;
   weatherEvidence: string;
   observationsNotes: string;
   // Carrier blame tactics
   carrierBlameTactics: string[];
   blameEvidenceChecked: Record<string, string[]>;
 }
 
 export interface ScoringResult {
   windEvidenceScore: number;
   alternativeCauseScore: number;
   netScore: number;
 }
 
 export interface IndicatorBreakdown {
   id: string;
   label: string;
   state: IndicatorState;
   weight: number;
   appliedWeight: number; // 0 for absent/unknown, full weight for present
   isPositive: boolean;
 }
 
 export interface CausationResult {
   decision: 'supported' | 'not_supported' | 'indeterminate';
   decisionStatement: string;
   butForStatement: string;
   minimumEvidenceMet: boolean;
   minimumEvidenceDetails: string[];
   topSupportingIndicators: IndicatorBreakdown[];
   topOpposingIndicators: IndicatorBreakdown[];
   evidenceGaps: string[];
   whatWouldChange: string[];
   scoring: ScoringResult;
   indicatorBreakdown: IndicatorBreakdown[];
   baselineSusceptibility: string;
   counterArgumentsSummary?: string;
 }
 
 // Decision thresholds
 export const DECISION_THRESHOLD = 15;
 export const MINIMUM_EVIDENCE_THRESHOLD = 1; // At least 1 core indicator must be present
 
 // Core indicators that satisfy minimum evidence requirement
 export const MINIMUM_EVIDENCE_INDICATORS = [
   'directional_pattern',
   'displaced_missing_materials',
   'collateral_same_exposure',
   'storm_plus_localized_damage'
 ];