 import {
   CausationFormData,
   CausationResult,
   IndicatorBreakdown,
   ScoringResult,
   IndicatorState,
   DECISION_THRESHOLD,
   MINIMUM_EVIDENCE_INDICATORS,
 } from './types';
 import { ALL_INDICATORS, PERILS } from './indicators';
 
 /**
  * Core scoring rule:
  * - Present (Yes): apply full weight
  * - Absent (No): apply zero weight (evidence of absence is NOT evidence against unless it's an alternative indicator)
  * - Unknown: apply zero weight and add to evidence gaps
  * 
  * CRITICAL: Unknown information must NEVER be treated as evidence against causation.
  */
 export function calculateCausation(formData: CausationFormData): CausationResult {
   const indicatorBreakdown: IndicatorBreakdown[] = [];
   const evidenceGaps: string[] = [];
   let windEvidenceScore = 0;
   let alternativeCauseScore = 0;
 
   // Process all indicators
   ALL_INDICATORS.forEach(indicator => {
     const value = formData.indicators[indicator.id];
     const state: IndicatorState = value?.state || 'unknown';
     
     let appliedWeight = 0;
     
     if (state === 'present') {
       // Full weight applied
       appliedWeight = indicator.weight;
       if (indicator.isPositive) {
         windEvidenceScore += indicator.weight;
       } else {
         alternativeCauseScore += indicator.weight;
       }
     } else if (state === 'absent') {
       // Zero weight - absence is NOT evidence against
       // Exception: For alternative cause indicators, "absent" means the alternative was checked and ruled out
       appliedWeight = 0;
     } else {
       // Unknown - zero weight, add to gaps if it's a supporting indicator
       appliedWeight = 0;
       if (indicator.isPositive && indicator.category === 'core_evidence') {
         evidenceGaps.push(`${indicator.label} — not observed, not documented, or not evaluated`);
       }
     }
 
     indicatorBreakdown.push({
       id: indicator.id,
       label: indicator.label,
       state,
       weight: indicator.weight,
       appliedWeight,
       isPositive: indicator.isPositive,
     });
   });
 
   // Add general evidence gaps for unknown/missing documentation
   if (!formData.eventDate) {
     evidenceGaps.push('Date/time of alleged event not specified');
   }
   if (!formData.damageNoticedDate) {
     evidenceGaps.push('Date damage was first noticed not specified');
   }
   if (!formData.weatherEvidence) {
     evidenceGaps.push('Weather/event documentation not provided');
   }
   if (!formData.roofAge) {
     evidenceGaps.push('Roof age unknown');
   }
 
   // Check minimum evidence requirement
   const minimumEvidenceDetails: string[] = [];
   const coreIndicatorsPresent = MINIMUM_EVIDENCE_INDICATORS.filter(id => {
     const value = formData.indicators[id];
     return value?.state === 'present';
   });
   
   const minimumEvidenceMet = coreIndicatorsPresent.length >= 1;
   
   if (!minimumEvidenceMet) {
     minimumEvidenceDetails.push(
       'At least ONE of the following must be present to support causation:',
       '• Directional damage pattern documented',
       '• Displaced/missing roofing materials consistent with wind',
       '• Collateral damage on same exposure (gutters, flashing, siding)',
       '• Verified storm event plus localized damage inconsistent with uniform aging'
     );
   } else {
     coreIndicatorsPresent.forEach(id => {
       const indicator = ALL_INDICATORS.find(i => i.id === id);
       if (indicator) {
         minimumEvidenceDetails.push(`✓ ${indicator.label}`);
       }
     });
   }
 
   // Calculate net score
   const netScore = windEvidenceScore - alternativeCauseScore;
   const scoring: ScoringResult = {
     windEvidenceScore,
     alternativeCauseScore,
     netScore,
   };
 
   // Get top supporting and opposing indicators
   const presentIndicators = indicatorBreakdown.filter(i => i.state === 'present');
   const topSupportingIndicators = presentIndicators
     .filter(i => i.isPositive)
     .sort((a, b) => b.appliedWeight - a.appliedWeight)
     .slice(0, 3);
   
   const topOpposingIndicators = presentIndicators
     .filter(i => !i.isPositive)
     .sort((a, b) => b.appliedWeight - a.appliedWeight)
     .slice(0, 3);
 
   // Determine decision using proper logic
   let decision: 'supported' | 'not_supported' | 'indeterminate';
   
   // Apply minimum evidence hard rule
   if (!minimumEvidenceMet) {
     // Cannot be "Supported" without minimum evidence
     if (alternativeCauseScore - windEvidenceScore >= DECISION_THRESHOLD) {
       decision = 'not_supported';
     } else {
       decision = 'indeterminate';
     }
   } else {
     // Minimum evidence met - apply threshold logic
     if (netScore >= DECISION_THRESHOLD) {
       decision = 'supported';
     } else if (alternativeCauseScore - windEvidenceScore >= DECISION_THRESHOLD) {
       decision = 'not_supported';
     } else {
       decision = 'indeterminate';
     }
   }
 
   // Generate statements with cautious insurance language
   const perilLabel = PERILS.find(p => p.value === formData.perilTested)?.label || formData.perilTested;
   
   let butForStatement: string;
   let decisionStatement: string;
   
   switch (decision) {
     case 'supported':
       butForStatement = `If not for the ${perilLabel.toLowerCase()} event, the ${formData.damageType.toLowerCase()} would LIKELY NOT have occurred. The documented evidence is consistent with ${perilLabel.toLowerCase()}-induced damage.`;
       decisionStatement = `The available evidence suggests ${perilLabel.toLowerCase()} as the proximate cause. ${topSupportingIndicators.length} key indicators support this conclusion. Pre-existing conditions, if present, do not exclude coverage—the covered peril appears to be the triggering event.`;
       break;
     case 'not_supported':
       butForStatement = `The evidence is INSUFFICIENT to conclude that ${perilLabel.toLowerCase()} was the proximate cause of the ${formData.damageType.toLowerCase()}.`;
       decisionStatement = `Available evidence suggests alternative causation factors. However, if the carrier is relying on competing causes (installation, maintenance, manufacturing), specific counter-arguments and evidence requirements should be reviewed.`;
       break;
     default:
       butForStatement = `Insufficient evidence exists to conclusively determine whether the ${formData.damageType.toLowerCase()} would have occurred without the ${perilLabel.toLowerCase()} event.`;
       decisionStatement = minimumEvidenceMet 
         ? `Additional documentation is recommended to strengthen the causation argument. Focus on filling the identified evidence gaps.`
         : `Minimum evidence requirements are not met. At least one core indicator must be documented before causation can be supported.`;
   }
 
   // Generate "what would change" recommendations
   const whatWouldChange: string[] = [];
   
   if (decision !== 'supported') {
     if (!minimumEvidenceMet) {
       whatWouldChange.push('Document at least ONE core evidence indicator (directional pattern, displaced materials, collateral damage, or storm + localized damage)');
     }
     
     // Find high-value unknown indicators
     const unknownHighValue = indicatorBreakdown
       .filter(i => i.state === 'unknown' && i.isPositive && i.weight >= 12)
       .slice(0, 2);
     
     unknownHighValue.forEach(i => {
       whatWouldChange.push(`Document "${i.label}" (+${i.weight} points if present)`);
     });
   }
   
   if (decision === 'supported' && topOpposingIndicators.length > 0) {
     topOpposingIndicators.forEach(i => {
       whatWouldChange.push(`Address "${i.label}" with counter-evidence to strengthen position`);
     });
   }
 
   // Generate baseline susceptibility statement (contextual, not scored)
   let baselineSusceptibility = '';
   const roofAgeNum = parseInt(formData.roofAge) || 0;
   
   if (roofAgeNum > 0) {
     if (roofAgeNum < 5) {
       baselineSusceptibility = `Given the roof's relatively young age (${roofAgeNum} years), minimal deterioration would be expected absent the covered peril.`;
     } else if (roofAgeNum < 15) {
       baselineSusceptibility = `Given the roof's age (${roofAgeNum} years) and material, some seal strip degradation per ARMA TB-201 would be expected; however, this increases susceptibility to wind damage rather than causing it independently.`;
     } else {
       baselineSusceptibility = `Given the roof's age (${roofAgeNum} years), deterioration and reduced wind resistance would be expected absent the peril; however, the ${decision === 'supported' ? 'observed damage pattern is' : 'question is whether damage is'} consistent with ${perilLabel.toLowerCase()}-induced failure versus normal aging.`;
     }
   }
 
   return {
     decision,
     decisionStatement,
     butForStatement,
     minimumEvidenceMet,
     minimumEvidenceDetails,
     topSupportingIndicators,
     topOpposingIndicators,
     evidenceGaps,
     whatWouldChange,
     scoring,
     indicatorBreakdown,
     baselineSusceptibility,
     counterArgumentsSummary: formData.carrierBlameTactics.length > 0 
       ? `Carrier blame-shifting tactics identified: ${formData.carrierBlameTactics.length} defensive arguments prepared.`
       : undefined,
   };
 }