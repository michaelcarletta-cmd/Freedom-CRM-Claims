-- Counter-argument library for common denial reasons and proven rebuttals
CREATE TABLE public.counter_arguments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  denial_category TEXT NOT NULL,
  denial_reason TEXT NOT NULL,
  denial_keywords TEXT[] DEFAULT '{}',
  rebuttal_template TEXT NOT NULL,
  legal_citations TEXT,
  success_rate INTEGER,
  usage_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Extracted document data for smart extraction
CREATE TABLE public.extracted_document_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  source_file_name TEXT,
  extracted_data JSONB NOT NULL DEFAULT '{}',
  rcv_total DECIMAL(12,2),
  acv_total DECIMAL(12,2),
  deductible DECIMAL(12,2),
  depreciation DECIMAL(12,2),
  line_items JSONB DEFAULT '[]',
  extraction_confidence DECIMAL(3,2),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.counter_arguments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracted_document_data ENABLE ROW LEVEL SECURITY;

-- Counter arguments policies (all authenticated users can read)
CREATE POLICY "Anyone can view active counter arguments"
  ON public.counter_arguments
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage counter arguments"
  ON public.counter_arguments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin')
    )
  );

-- Extracted document data policies
CREATE POLICY "Users can view extracted data for accessible claims"
  ON public.extracted_document_data
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.id = claim_id
    )
  );

CREATE POLICY "Staff can insert extracted data"
  ON public.extracted_document_data
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'staff')
    )
  );

-- Indexes for performance
CREATE INDEX idx_counter_arguments_category ON public.counter_arguments(denial_category);
CREATE INDEX idx_counter_arguments_keywords ON public.counter_arguments USING GIN(denial_keywords);
CREATE INDEX idx_extracted_data_claim ON public.extracted_document_data(claim_id);
CREATE INDEX idx_extracted_data_type ON public.extracted_document_data(document_type);

-- Seed some common counter-arguments
INSERT INTO public.counter_arguments (denial_category, denial_reason, denial_keywords, rebuttal_template, legal_citations) VALUES
('Pre-existing Condition', 'Damage existed prior to the claimed event', ARRAY['pre-existing', 'prior damage', 'wear and tear', 'maintenance'], 
'The carrier''s assertion of pre-existing damage is unsupported by the evidence. Our documentation establishes that [DAMAGE_TYPE] damage is consistent with the [DATE_OF_LOSS] storm event. The observed damage patterns—including [SPECIFIC_OBSERVATIONS]—are characteristic of [CAUSE_OF_LOSS] damage, not gradual deterioration.

Furthermore, the homeowner''s maintenance records demonstrate the property was in good condition prior to the loss. The carrier has failed to provide any inspection reports, photographs, or expert opinions dated before the loss that would substantiate claims of pre-existing damage.', 
'N.J.S.A. 17:29B-4 / 40 P.S. § 1171.5'),

('Cosmetic Damage', 'Damage is cosmetic and does not affect function', ARRAY['cosmetic', 'functional', 'aesthetic', 'appearance only'],
'The characterization of this damage as merely "cosmetic" fundamentally misrepresents the nature and extent of the loss. Physical damage to [COMPONENT] compromises its protective function and structural integrity regardless of whether it has caused immediate water intrusion.

Manufacturer specifications require that damaged [MATERIAL] be replaced, not patched or left in place. The carrier''s position effectively asks the insured to accept a diminished property with compromised protection against future weather events—a position inconsistent with the policy''s promise of restoration.

Additionally, modern building codes and industry standards recognize that compromised roofing/siding materials continue to deteriorate and will fail prematurely, making replacement—not cosmetic repair—the appropriate remedy.',
'N.J.S.A. 17:29B-4 / 40 P.S. § 1171.5'),

('No Coverage', 'Claimed damage is not covered under policy', ARRAY['not covered', 'excluded', 'exclusion applies', 'policy exclusion'],
'The carrier''s coverage denial is premature and unsupported. The policy provides coverage for direct physical loss caused by [COVERED_PERIL]. Our documentation demonstrates that the claimed damage resulted directly from this covered peril.

The carrier has failed to identify any specific policy exclusion that would apply to this loss. Generic references to exclusions without application to the specific facts of this claim are insufficient grounds for denial.

We request the carrier provide the specific policy language it relies upon and explain how that language applies to the documented damage. Absent this analysis, the denial appears arbitrary and not based on a reasonable interpretation of the policy.',
'N.J.S.A. 17:29B-4 / 40 P.S. § 1171.5'),

('Insufficient Documentation', 'Claim lacks sufficient documentation', ARRAY['insufficient', 'documentation', 'no proof', 'unsubstantiated'],
'We have provided comprehensive documentation supporting this claim, including:
• Detailed photographs of all damaged areas
• Professional inspection reports
• Repair estimates from licensed contractors
• Weather data confirming the loss event
• Timeline of events and damage discovery

If additional documentation is needed, please specify exactly what is required. Blanket statements about "insufficient documentation" without identifying specific deficiencies fail to provide the insured with a meaningful opportunity to address the carrier''s concerns and may constitute bad faith claim handling.',
'N.J.S.A. 17:29B-4 / 40 P.S. § 1171.5'),

('Below Deductible', 'Repair costs are below the policy deductible', ARRAY['below deductible', 'under deductible', 'deductible not met'],
'The carrier''s assessment that repair costs fall below the deductible is based on an incomplete scope of damage. Our estimate, prepared by a licensed contractor with expertise in [TYPE] repair, identifies [TOTAL_AMOUNT] in necessary repairs.

The carrier''s estimate omits critical items including:
• [OMITTED_ITEMS]

When the full scope of damage is properly assessed, the claim clearly exceeds the deductible. We request a re-inspection with all areas of damage properly documented and included in the carrier''s estimate.',
'N.J.S.A. 17:29B-4 / 40 P.S. § 1171.5');

-- Add update trigger
CREATE TRIGGER update_counter_arguments_updated_at
  BEFORE UPDATE ON public.counter_arguments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();