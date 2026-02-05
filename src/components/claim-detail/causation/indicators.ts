 import { CausationIndicator } from './types';
 
 // Indicators that support the tested peril (positive weight)
 export const PERIL_SUPPORTING_INDICATORS: CausationIndicator[] = [
   // Core evidence indicators (satisfy minimum evidence requirement)
   {
     id: 'directional_pattern',
     category: 'core_evidence',
     label: 'Directional damage pattern documented',
     weight: 20,
     description: 'Damage shows consistent directional pattern aligned with reported wind/weather event',
     isPositive: true,
   },
   {
     id: 'displaced_missing_materials',
     category: 'core_evidence',
     label: 'Displaced/missing roofing materials consistent with wind',
     weight: 20,
     description: 'Shingles, flashing, or other materials displaced or missing in pattern consistent with wind forces',
     isPositive: true,
   },
   {
     id: 'collateral_same_exposure',
     category: 'core_evidence',
     label: 'Collateral damage on same exposure (gutters, flashing, siding)',
     weight: 18,
     description: 'Other property components on same exposure show consistent damage',
     isPositive: true,
   },
   {
     id: 'storm_plus_localized_damage',
     category: 'core_evidence',
     label: 'Verified storm event plus localized damage inconsistent with uniform aging',
     weight: 18,
     description: 'Confirmed weather event AND damage pattern inconsistent with general wear',
     isPositive: true,
   },
   
   // Secondary supporting indicators
   {
     id: 'lifted_tabs',
     category: 'directional',
     label: 'Lifted/creased tabs in consistent direction',
     weight: 12,
     description: 'Shingle tabs lifted or creased with directional consistency',
     isPositive: true,
   },
   {
     id: 'debris_scatter_pattern',
     category: 'directional',
     label: 'Debris scatter pattern aligned with wind direction',
     weight: 10,
     description: 'Debris distribution indicates wind direction consistent with damage',
     isPositive: true,
   },
   {
     id: 'edge_damage_concentration',
     category: 'directional',
     label: 'Damage concentrated at edges/ridges (high wind exposure)',
     weight: 10,
     description: 'Damage pattern shows concentration at areas of highest wind exposure',
     isPositive: true,
   },
   {
     id: 'neighboring_property_damage',
     category: 'collateral',
     label: 'Neighboring properties show similar damage',
     weight: 12,
     description: 'Area-wide damage consistent with weather event',
     isPositive: true,
   },
   {
     id: 'fence_siding_damage',
     category: 'collateral',
     label: 'Fence/siding damage on same exposure',
     weight: 10,
     description: 'Non-roof structures damaged on same side of property',
     isPositive: true,
   },
   {
     id: 'verified_weather_event',
     category: 'event',
     label: 'NOAA/NWS verified weather event on date of loss',
     weight: 15,
     description: 'Official weather documentation confirms event occurrence',
     isPositive: true,
   },
   {
     id: 'immediate_notice',
     category: 'timeline',
     label: 'Damage noticed within 24 hours of event',
     weight: 8,
     description: 'Prompt discovery supports event causation',
     isPositive: true,
   },
   {
     id: 'fresh_fractures',
     category: 'physical',
     label: 'Fresh fractures/breaks visible (not weathered)',
     weight: 10,
     description: 'Material failures appear recent, not aged',
     isPositive: true,
   },
 ];
 
 // Indicators that support alternative causes (negative weight for peril)
 export const ALTERNATIVE_CAUSE_INDICATORS: CausationIndicator[] = [
   {
     id: 'uniform_wear_all_slopes',
     category: 'alternative',
     label: 'Uniform wear across ALL slopes (not directional)',
     weight: 15,
     description: 'Affirmative evidence that damage is uniform, indicating age rather than event',
     isPositive: false,
   },
   {
     id: 'damage_predates_event',
     category: 'alternative',
     label: 'Documented evidence damage predates reported event',
     weight: 20,
     description: 'Photos, inspections, or records showing damage existed before event',
     isPositive: false,
   },
   {
     id: 'no_weather_event_documented',
     category: 'alternative',
     label: 'No weather event recorded on date of loss',
     weight: 12,
     description: 'Official records show no significant weather event occurred',
     isPositive: false,
   },
   {
     id: 'installation_defect_documented',
     category: 'alternative',
     label: 'Documented installation defect as primary cause',
     weight: 15,
     description: 'Evidence of improper installation directly causing this specific damage',
     isPositive: false,
   },
   {
     id: 'prior_damage_same_location',
     category: 'alternative',
     label: 'Prior claim/repair at same location documented',
     weight: 10,
     description: 'Records show previous damage and repair at exact damage location',
     isPositive: false,
   },
 ];
 
 export const ALL_INDICATORS = [...PERIL_SUPPORTING_INDICATORS, ...ALTERNATIVE_CAUSE_INDICATORS];
 
 export const PERILS = [
   { value: 'wind', label: 'Wind' },
   { value: 'hail', label: 'Hail' },
   { value: 'water', label: 'Water/Rain' },
   { value: 'fire', label: 'Fire' },
   { value: 'ice', label: 'Ice/Snow' },
   { value: 'falling_object', label: 'Falling Object/Tree' },
 ];
 
 export const DAMAGE_TYPES = [
   'Shingle creasing/lifting',
   'Missing shingles',
   'Granule loss',
   'Punctures/holes',
   'Flashing damage',
   'Gutter damage',
   'Siding damage',
  'Bruising/soft spots',
   'Water intrusion',
   'Structural damage',
   'Other',
 ];
 
 export const SHINGLE_TYPES = [
   { value: '3_tab', label: '3-Tab Shingles' },
   { value: 'architectural', label: 'Architectural/Dimensional' },
   { value: 'metal', label: 'Metal Roofing' },
   { value: 'tile', label: 'Tile Roofing' },
   { value: 'slate', label: 'Slate' },
   { value: 'wood_shake', label: 'Wood Shake' },
   { value: 'unknown', label: 'Unknown' },
 ];