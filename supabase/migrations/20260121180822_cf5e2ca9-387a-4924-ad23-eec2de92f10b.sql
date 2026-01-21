-- Phase 2: Deep Integration Features

-- Table for deadline tracking with state-specific rules
CREATE TABLE public.claim_deadlines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  deadline_type TEXT NOT NULL, -- 'acknowledgment', 'investigation', 'response', 'payment', 'statute_of_limitations', 'appraisal_demand'
  deadline_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'met', 'missed', 'waived'
  state_code TEXT NOT NULL, -- 'NJ', 'PA'
  regulation_reference TEXT, -- e.g., 'N.J.A.C. 11:2-17.6'
  notes TEXT,
  triggered_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for photo-to-estimate line item linking
CREATE TABLE public.photo_line_item_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  photo_id UUID NOT NULL REFERENCES public.claim_photos(id) ON DELETE CASCADE,
  extracted_data_id UUID REFERENCES public.extracted_document_data(id) ON DELETE SET NULL,
  line_item_index INTEGER, -- Index in the line_items array
  line_item_description TEXT,
  confidence_score NUMERIC(5,4), -- AI confidence 0.0000 to 1.0000
  match_type TEXT NOT NULL DEFAULT 'auto', -- 'auto', 'manual'
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for building code citations cache
CREATE TABLE public.building_code_citations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code_source TEXT NOT NULL, -- 'ICC', 'IBC', 'IRC', 'NEC', etc.
  code_year TEXT NOT NULL,
  section_number TEXT NOT NULL,
  section_title TEXT,
  content TEXT NOT NULL,
  keywords TEXT[], -- For search matching
  state_adoptions TEXT[], -- States that have adopted this code
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(code_source, code_year, section_number)
);

-- Table for manufacturer specs cache
CREATE TABLE public.manufacturer_specs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  manufacturer TEXT NOT NULL,
  product_category TEXT NOT NULL, -- 'roofing', 'siding', 'windows', etc.
  product_name TEXT,
  spec_type TEXT NOT NULL, -- 'installation', 'warranty', 'maintenance', 'repair'
  content TEXT NOT NULL,
  source_url TEXT,
  keywords TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.claim_deadlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_line_item_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.building_code_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturer_specs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for claim_deadlines (similar to other claim-related tables)
CREATE POLICY "Allow all operations for authenticated users" ON public.claim_deadlines FOR ALL USING (true);

-- RLS Policies for photo_line_item_links
CREATE POLICY "Allow all operations for authenticated users" ON public.photo_line_item_links FOR ALL USING (true);

-- RLS Policies for building_code_citations (read-only for users, admin manages)
CREATE POLICY "Allow read for authenticated users" ON public.building_code_citations FOR SELECT USING (true);
CREATE POLICY "Allow all for authenticated users" ON public.building_code_citations FOR ALL USING (true);

-- RLS Policies for manufacturer_specs
CREATE POLICY "Allow read for authenticated users" ON public.manufacturer_specs FOR SELECT USING (true);
CREATE POLICY "Allow all for authenticated users" ON public.manufacturer_specs FOR ALL USING (true);

-- Seed some common building code citations
INSERT INTO public.building_code_citations (code_source, code_year, section_number, section_title, content, keywords, state_adoptions) VALUES
('IBC', '2021', 'R905.2.8', 'Asphalt Shingle Flashing', 'At the juncture of roof vertical surfaces, step flashing shall be used and shall be a minimum 4 inches by 4 inches. The flashing shall be installed to divert the water away from the vertical surface and over the roof covering.', ARRAY['roofing', 'shingles', 'flashing', 'step flashing'], ARRAY['NJ', 'PA']),
('IBC', '2021', 'R905.2.4', 'Asphalt Shingle Underlayment', 'Unless otherwise noted, required underlayment shall conform to ASTM D226 Type I, ASTM D4869 Type I, II, III or IV, or ASTM D6757. Self-adhering polymer modified bitumen sheet underlayment shall comply with ASTM D1970.', ARRAY['roofing', 'underlayment', 'shingles', 'asphalt'], ARRAY['NJ', 'PA']),
('IBC', '2021', 'R905.2.6', 'Asphalt Shingle Attachment', 'Asphalt shingles shall have the minimum number of fasteners required by the manufacturer, but not less than four fasteners per strip shingle or two fasteners per individual shingle.', ARRAY['roofing', 'shingles', 'fasteners', 'nails', 'attachment'], ARRAY['NJ', 'PA']),
('IRC', '2021', 'R703.8', 'Vinyl Siding', 'Vinyl siding shall be installed in accordance with the manufacturer''s installation instructions. Vinyl siding, soffit and accessories shall conform to the requirements of ASTM D3679.', ARRAY['siding', 'vinyl', 'installation'], ARRAY['NJ', 'PA']),
('IRC', '2021', 'R703.2', 'Weather-Resistant Exterior Wall Envelope', 'The exterior wall envelope shall be designed and constructed in a manner that prevents the accumulation of water within the wall assembly by providing a water-resistive barrier behind the exterior veneer.', ARRAY['siding', 'water barrier', 'exterior wall', 'weather resistant'], ARRAY['NJ', 'PA']),
('NEC', '2020', '690', 'Solar Photovoltaic Systems', 'The requirements of this article shall apply to solar photovoltaic (PV) systems, including the array circuit(s), inverter(s), and controller(s) for such systems.', ARRAY['solar', 'photovoltaic', 'electrical', 'inverter'], ARRAY['NJ', 'PA']);

-- Seed some manufacturer specs examples
INSERT INTO public.manufacturer_specs (manufacturer, product_category, product_name, spec_type, content, keywords) VALUES
('GAF', 'roofing', 'Timberline HDZ', 'installation', 'GAF Timberline HDZ shingles require a minimum of 6 nails per shingle in high-wind areas. Shingles must be installed over GAF-approved underlayment. Partial repairs are not recommended as they may void the warranty.', ARRAY['roofing', 'shingles', 'GAF', 'Timberline', 'installation', 'warranty']),
('Owens Corning', 'roofing', 'Duration', 'warranty', 'The Owens Corning Duration limited warranty requires full system installation with approved components. Partial repairs using non-Owens Corning materials may void coverage. Mixing old and new shingles is not covered under warranty.', ARRAY['roofing', 'shingles', 'Owens Corning', 'Duration', 'warranty']),
('CertainTeed', 'roofing', 'Landmark', 'installation', 'CertainTeed Landmark shingles require 4 nails per shingle standard, 6 nails in high-wind regions. Starter strips must be CertainTeed-approved. Repair of individual shingles is not recommended by the manufacturer.', ARRAY['roofing', 'shingles', 'CertainTeed', 'Landmark', 'installation']),
('James Hardie', 'siding', 'HardiePlank', 'installation', 'HardiePlank fiber cement siding requires specific fastener patterns and must be painted with approved coatings. Partial replacement sections must match existing profile and texture for proper performance.', ARRAY['siding', 'fiber cement', 'James Hardie', 'HardiePlank']),
('Andersen', 'windows', 'E-Series', 'repair', 'Andersen E-Series windows are designed as complete units. Glass replacement requires factory-authorized service. Frame repairs are not field-serviceable and require full unit replacement for warranty coverage.', ARRAY['windows', 'Andersen', 'E-Series', 'replacement', 'warranty']);