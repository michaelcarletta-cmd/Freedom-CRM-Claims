
-- State-specific insurance regulations for PA and NJ
CREATE TABLE public.state_insurance_regulations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  state_code VARCHAR(2) NOT NULL,
  state_name TEXT NOT NULL,
  regulation_type TEXT NOT NULL, -- 'pol_deadline', 'insurer_response', 'bad_faith', 'unfair_claims'
  regulation_title TEXT NOT NULL,
  regulation_citation TEXT NOT NULL,
  deadline_days INTEGER,
  description TEXT NOT NULL,
  consequence_description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert PA regulations
INSERT INTO public.state_insurance_regulations (state_code, state_name, regulation_type, regulation_title, regulation_citation, deadline_days, description, consequence_description) VALUES
('PA', 'Pennsylvania', 'insurer_response', 'Initial Response Deadline', '31 Pa. Code § 146.5(a)', 10, 'Insurance company must acknowledge receipt of claim within 10 working days', 'Violation may constitute unfair claims practice'),
('PA', 'Pennsylvania', 'insurer_response', 'Claim Decision Deadline', '31 Pa. Code § 146.5(b)', 15, 'Insurance company must accept or deny claim within 15 working days after receiving proof of loss', 'Insurer must provide written explanation for any delay'),
('PA', 'Pennsylvania', 'insurer_response', 'Payment Deadline', '31 Pa. Code § 146.6', 30, 'Payment must be made within 30 days of claim acceptance', 'Interest accrues at 12% per annum on overdue payments'),
('PA', 'Pennsylvania', 'bad_faith', 'Bad Faith Statute', '42 Pa.C.S. § 8371', NULL, 'Insurer acting in bad faith toward insured may be liable for damages, interest, punitive damages, and attorney fees', 'Policyholder can recover compensatory damages, punitive damages, court costs, and reasonable attorney fees'),
('PA', 'Pennsylvania', 'pol_deadline', 'Proof of Loss Deadline', 'Standard Policy Form', 60, 'Policyholder typically has 60 days from insurer request to submit sworn proof of loss', 'Failure may result in claim denial, but courts apply substantial compliance standard'),
('PA', 'Pennsylvania', 'unfair_claims', 'Unfair Claims Settlement Practices', '40 P.S. § 1171.5', NULL, 'Prohibits unfair claim settlement practices including misrepresentation, failure to acknowledge claims promptly, and failure to adopt reasonable standards for investigation', 'Insurance Department may impose penalties and sanctions');

-- Insert NJ regulations  
INSERT INTO public.state_insurance_regulations (state_code, state_name, regulation_type, regulation_title, regulation_citation, deadline_days, description, consequence_description) VALUES
('NJ', 'New Jersey', 'insurer_response', 'Initial Response Deadline', 'N.J.A.C. 11:2-17.6(a)', 10, 'Insurance company must acknowledge receipt of claim within 10 working days', 'Violation of unfair claims settlement practices'),
('NJ', 'New Jersey', 'insurer_response', 'Claim Investigation Deadline', 'N.J.A.C. 11:2-17.6(b)', 30, 'Insurance company must complete investigation within 30 calendar days of receiving proof of loss', 'Must provide written notice if extension needed'),
('NJ', 'New Jersey', 'insurer_response', 'Claim Decision Deadline', 'N.J.A.C. 11:2-17.6(c)', 30, 'Must accept or deny claim within 30 days after investigation complete', 'Written explanation required for any denial'),
('NJ', 'New Jersey', 'insurer_response', 'Payment Deadline', 'N.J.A.C. 11:2-17.7', 10, 'Payment must be made within 10 business days of claim acceptance', 'Interest penalties apply for late payments'),
('NJ', 'New Jersey', 'bad_faith', 'Consumer Fraud Act', 'N.J.S.A. 56:8-1 et seq.', NULL, 'Bad faith claims practices may violate Consumer Fraud Act allowing treble damages', 'Policyholder may recover treble damages plus attorney fees and costs'),
('NJ', 'New Jersey', 'pol_deadline', 'Proof of Loss Deadline', 'Standard Policy Form', 60, 'Policyholder typically has 60 days from insurer request to submit sworn proof of loss', 'NJ courts apply substantial compliance doctrine'),
('NJ', 'New Jersey', 'unfair_claims', 'Unfair Claims Settlement Practices', 'N.J.A.C. 11:2-17', NULL, 'Comprehensive regulations governing fair claims handling including investigation standards, communication requirements, and settlement practices', 'Department of Banking and Insurance may impose fines up to $10,000 per violation');

-- Home inventory for contents claims
CREATE TABLE public.claim_home_inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  room_name TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_description TEXT,
  quantity INTEGER DEFAULT 1,
  original_purchase_date DATE,
  original_purchase_price DECIMAL(12,2),
  replacement_cost DECIMAL(12,2),
  actual_cash_value DECIMAL(12,2),
  condition_before_loss TEXT, -- 'new', 'good', 'fair', 'poor'
  damage_description TEXT,
  manufacturer TEXT,
  model_number TEXT,
  serial_number TEXT,
  receipt_file_path TEXT,
  photo_file_paths TEXT[],
  replacement_link TEXT,
  is_total_loss BOOLEAN DEFAULT true,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Communications diary for adjuster interactions
CREATE TABLE public.claim_communications_diary (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  communication_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  communication_type TEXT NOT NULL, -- 'phone', 'email', 'letter', 'in_person', 'voicemail'
  direction TEXT NOT NULL, -- 'inbound', 'outbound'
  contact_name TEXT,
  contact_title TEXT,
  contact_company TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  employee_id TEXT,
  summary TEXT NOT NULL,
  promises_made TEXT,
  deadlines_mentioned TEXT,
  follow_up_required BOOLEAN DEFAULT false,
  follow_up_date DATE,
  recording_file_path TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Loss of use / Additional Living Expenses tracker
CREATE TABLE public.claim_loss_of_use_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  expense_category TEXT NOT NULL, -- 'lodging', 'meals', 'storage', 'transportation', 'laundry', 'pet_boarding', 'other'
  expense_date DATE NOT NULL,
  vendor_name TEXT,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  receipt_file_path TEXT,
  is_submitted_to_insurer BOOLEAN DEFAULT false,
  submitted_date DATE,
  is_reimbursed BOOLEAN DEFAULT false,
  reimbursed_amount DECIMAL(12,2),
  reimbursed_date DATE,
  denial_reason TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Carrier deadline tracking
CREATE TABLE public.claim_carrier_deadlines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  deadline_type TEXT NOT NULL, -- 'acknowledgment', 'investigation', 'decision', 'payment', 'pol_response'
  regulation_id UUID REFERENCES public.state_insurance_regulations(id),
  trigger_date DATE NOT NULL, -- date that started the clock
  trigger_description TEXT NOT NULL, -- e.g., 'POL submitted', 'Claim filed'
  deadline_date DATE NOT NULL,
  is_business_days BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'pending', -- 'pending', 'met', 'missed', 'extended'
  carrier_response_date DATE,
  carrier_response_summary TEXT,
  extension_requested BOOLEAN DEFAULT false,
  extension_reason TEXT,
  days_overdue INTEGER,
  bad_faith_potential BOOLEAN DEFAULT false,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Hidden loss checklist
CREATE TABLE public.hidden_loss_checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  loss_type TEXT NOT NULL, -- 'water', 'fire', 'wind', 'hail', 'storm'
  category TEXT NOT NULL,
  item_name TEXT NOT NULL,
  description TEXT NOT NULL,
  common_locations TEXT,
  detection_tips TEXT,
  typical_cost_range TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Claim-specific hidden loss tracking
CREATE TABLE public.claim_hidden_loss_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  checklist_item_id UUID REFERENCES public.hidden_loss_checklist_items(id),
  custom_item_name TEXT,
  is_checked BOOLEAN DEFAULT false,
  is_damage_found BOOLEAN,
  damage_description TEXT,
  estimated_cost DECIMAL(12,2),
  photo_file_paths TEXT[],
  notes TEXT,
  checked_by UUID,
  checked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert common hidden loss checklist items
INSERT INTO public.hidden_loss_checklist_items (loss_type, category, item_name, description, common_locations, detection_tips, typical_cost_range, display_order) VALUES
-- Water damage hidden losses
('water', 'Structure', 'Subfloor damage', 'Water seeps under flooring causing rot, warping, or mold in subfloor', 'Under hardwood, laminate, tile; near bathrooms and kitchens', 'Use moisture meter; check for soft spots or buckling', '$2,000 - $15,000', 1),
('water', 'Structure', 'Wall cavity mold', 'Mold growth inside walls from water intrusion not visible from surface', 'Behind drywall near water sources, exterior walls, around windows', 'Look for musty odors, discoloration; may need professional testing', '$1,500 - $10,000', 2),
('water', 'Structure', 'Insulation damage', 'Wet insulation loses R-value and can harbor mold', 'Attic, wall cavities, crawl spaces', 'Check for sagging, discoloration, odors in accessible areas', '$1,000 - $8,000', 3),
('water', 'Electrical', 'Outlet and wiring damage', 'Water in electrical boxes can cause corrosion, shorts, fire hazards', 'Lower wall outlets, basement panels, exterior junction boxes', 'Have electrician inspect; look for corrosion or discoloration', '$500 - $5,000', 4),
('water', 'HVAC', 'Ductwork contamination', 'Water and mold in HVAC ducts spreads contaminants throughout home', 'Supply and return ducts, especially in basements/crawlspaces', 'Inspect accessible duct sections; professional duct inspection', '$2,000 - $8,000', 5),

-- Fire damage hidden losses
('fire', 'Structure', 'Smoke damage in walls', 'Smoke penetrates wall cavities leaving persistent odor and contamination', 'Throughout home, especially near fire origin', 'Open outlet covers to check for smoke smell inside walls', '$5,000 - $30,000', 1),
('fire', 'HVAC', 'HVAC system smoke contamination', 'Smoke particles coat HVAC components and spread throughout system', 'Air handler, ductwork, registers throughout home', 'Have HVAC professional inspect; may need complete replacement', '$3,000 - $15,000', 2),
('fire', 'Electrical', 'Heat-damaged wiring', 'Heat can damage wire insulation without visible melting', 'Near fire area, attic, wall cavities', 'Electrical inspection required; check for brittle insulation', '$2,000 - $10,000', 3),
('fire', 'Structure', 'Structural char damage', 'Fire can char structural members without complete destruction', 'Roof trusses, floor joists, wall studs near fire', 'Professional structural inspection; may need reinforcement', '$5,000 - $50,000', 4),

-- Wind/Storm damage hidden losses
('wind', 'Roof', 'Underlayment damage', 'High winds can damage underlayment even if shingles look intact', 'Under shingles, especially at edges and peaks', 'Requires shingle removal to inspect; look for tears or displacement', '$2,000 - $8,000', 1),
('wind', 'Roof', 'Decking damage', 'Wind uplift can loosen or damage roof decking beneath shingles', 'Roof deck, especially at eaves and ridges', 'Check attic for daylight; look for lifted or cracked decking', '$3,000 - $15,000', 2),
('wind', 'Structure', 'Soffit and fascia damage', 'Wind-driven rain enters through damaged soffits causing interior damage', 'Eaves, overhangs, gable ends', 'Inspect from ladder; check attic for water staining', '$1,000 - $5,000', 3),
('wind', 'Windows', 'Seal failures', 'Pressure changes can cause window seal failures and future fogging', 'All windows, especially large panes', 'May not show immediately; document for future claim', '$300 - $800 per window', 4),

-- Hail damage hidden losses
('hail', 'Roof', 'Granule loss acceleration', 'Hail bruises shingles causing accelerated granule loss over time', 'Entire roof surface, especially south and west exposures', 'Check gutters for granules; soft spots indicate bruising', 'Full roof replacement often required', 1),
('hail', 'Roof', 'Metal flashing dents', 'Hail dents flashings compromising waterproofing', 'Around chimneys, vents, valleys, edges', 'Visual inspection; dented flashing needs replacement', '$500 - $3,000', 2),
('hail', 'HVAC', 'AC condenser damage', 'Hail damages condenser fins reducing efficiency', 'Exterior AC unit', 'Visual inspection for bent fins; may need fin comb or replacement', '$500 - $5,000', 3),
('hail', 'Exterior', 'Siding bruising', 'Vinyl and aluminum siding can be bruised without obvious cracks', 'All exterior walls, especially west exposure', 'Inspect at angle in sunlight; look for circular impact marks', '$5,000 - $25,000', 4),
('hail', 'Windows', 'Screen and frame damage', 'Hail damages screens and can crack window frames', 'All windows and doors', 'Inspect each screen and frame; often overlooked', '$50 - $200 per screen', 5);

-- Qualifying language templates
CREATE TABLE public.qualifying_language_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_type TEXT NOT NULL, -- 'pol', 'estimate', 'inventory', 'correspondence', 'general'
  template_name TEXT NOT NULL,
  template_text TEXT NOT NULL,
  usage_context TEXT,
  state_specific VARCHAR(2), -- NULL for universal, 'PA' or 'NJ' for state-specific
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

INSERT INTO public.qualifying_language_templates (template_type, template_name, template_text, usage_context) VALUES
('pol', 'Not an Expert', 'The undersigned is not an expert in property damage assessment, construction, or insurance adjusting. This submission is based on the best information available to me at this time and I rely on the insurance company to properly investigate and determine the full extent and cost of covered losses.', 'Include in Proof of Loss submissions'),
('pol', 'Subject to Revision', 'This Proof of Loss is submitted based on information known as of the date of signature. The scope and cost of repairs may change as work progresses and hidden damages are discovered. I reserve the right to submit supplemental proofs of loss as additional losses are identified.', 'Include in initial POL'),
('pol', 'Partial Submission', 'This is a PARTIAL Proof of Loss for known damages to date. Additional damages may exist that have not yet been identified or quantified. Submission of this partial proof does not waive my right to claim additional covered losses.', 'For early/incomplete POL submissions'),
('estimate', 'Estimate Disclaimer', 'This estimate represents the anticipated cost of repairs based on current information and market conditions. Actual costs may vary due to hidden damages, material availability, code requirements, contractor availability, and other factors. This estimate does not represent a cap on covered losses.', 'Include with repair estimates'),
('estimate', 'Code Upgrade Reserve', 'Repairs may require code upgrades mandated by current building codes that did not exist when the property was originally constructed. The cost of such upgrades is not reflected in this estimate but should be covered under applicable Ordinance or Law coverage.', 'For older properties'),
('inventory', 'Contents Disclaimer', 'This inventory represents my best recollection of damaged personal property. Additional items may be identified as cleanup and repair progresses. Stated values are estimates based on available information and may require adjustment.', 'Include with contents claims'),
('correspondence', 'Reservation of Rights', 'Nothing in this communication should be construed as a waiver of any rights under my policy, applicable state law, or common law. I expressly reserve all rights and remedies available to me.', 'Include in formal correspondence'),
('general', 'PA Bad Faith Notice', 'Please be advised that Pennsylvania law (42 Pa.C.S. § 8371) provides remedies for insurer bad faith, including compensatory damages, punitive damages, court costs, and attorney fees. This claim should be handled in accordance with all applicable regulations including 31 Pa. Code § 146.', 'For PA claims facing delays'),
('general', 'NJ Consumer Protection Notice', 'Please be advised that New Jersey law, including the Consumer Fraud Act (N.J.S.A. 56:8-1 et seq.) and Unfair Claims Settlement Practices regulations (N.J.A.C. 11:2-17), provides significant protections and remedies for policyholders. This claim should be handled in accordance with all applicable regulations.', 'For NJ claims facing delays');

-- Enable RLS
ALTER TABLE public.state_insurance_regulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_home_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_communications_diary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_loss_of_use_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_carrier_deadlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hidden_loss_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_hidden_loss_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qualifying_language_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies - State regulations readable by all authenticated users
CREATE POLICY "State regulations viewable by authenticated users" ON public.state_insurance_regulations FOR SELECT TO authenticated USING (true);

-- RLS Policies - Claim-related tables
CREATE POLICY "Users can view claim home inventory" ON public.claim_home_inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert claim home inventory" ON public.claim_home_inventory FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update claim home inventory" ON public.claim_home_inventory FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete claim home inventory" ON public.claim_home_inventory FOR DELETE TO authenticated USING (true);

CREATE POLICY "Users can view communications diary" ON public.claim_communications_diary FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert communications diary" ON public.claim_communications_diary FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update communications diary" ON public.claim_communications_diary FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete communications diary" ON public.claim_communications_diary FOR DELETE TO authenticated USING (true);

CREATE POLICY "Users can view loss of use expenses" ON public.claim_loss_of_use_expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert loss of use expenses" ON public.claim_loss_of_use_expenses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update loss of use expenses" ON public.claim_loss_of_use_expenses FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete loss of use expenses" ON public.claim_loss_of_use_expenses FOR DELETE TO authenticated USING (true);

CREATE POLICY "Users can view carrier deadlines" ON public.claim_carrier_deadlines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert carrier deadlines" ON public.claim_carrier_deadlines FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update carrier deadlines" ON public.claim_carrier_deadlines FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete carrier deadlines" ON public.claim_carrier_deadlines FOR DELETE TO authenticated USING (true);

CREATE POLICY "Hidden loss checklist viewable by authenticated" ON public.hidden_loss_checklist_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can view hidden loss checks" ON public.claim_hidden_loss_checks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert hidden loss checks" ON public.claim_hidden_loss_checks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update hidden loss checks" ON public.claim_hidden_loss_checks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete hidden loss checks" ON public.claim_hidden_loss_checks FOR DELETE TO authenticated USING (true);

CREATE POLICY "Qualifying templates viewable by authenticated" ON public.qualifying_language_templates FOR SELECT TO authenticated USING (true);
