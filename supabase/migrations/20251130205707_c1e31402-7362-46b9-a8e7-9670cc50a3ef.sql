-- Create claim_settlements table
CREATE TABLE public.claim_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  replacement_cost_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  non_recoverable_depreciation DECIMAL(12,2) NOT NULL DEFAULT 0,
  recoverable_depreciation DECIMAL(12,2) NOT NULL DEFAULT 0,
  deductible DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_settlement DECIMAL(12,2) GENERATED ALWAYS AS (
    replacement_cost_value - non_recoverable_depreciation - deductible
  ) STORED,
  estimate_amount DECIMAL(12,2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create claim_checks table
CREATE TABLE public.claim_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  check_number TEXT,
  check_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  check_type TEXT NOT NULL, -- 'initial', 'recoverable_depreciation', 'supplemental'
  received_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create claim_expenses table
CREATE TABLE public.claim_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  category TEXT, -- 'contractor', 'materials', 'inspection', 'other'
  paid_to TEXT,
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create claim_fees table
CREATE TABLE public.claim_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  company_fee_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  company_fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  adjuster_fee_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  adjuster_fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(claim_id)
);

-- Enable RLS
ALTER TABLE public.claim_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_fees ENABLE ROW LEVEL SECURITY;

-- RLS policies for claim_settlements
CREATE POLICY "Admins and staff can manage settlements"
ON public.claim_settlements FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

CREATE POLICY "Users can view settlements for accessible claims"
ON public.claim_settlements FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM claims
    WHERE claims.id = claim_settlements.claim_id
    AND (
      has_role(auth.uid(), 'admin')
      OR has_role(auth.uid(), 'staff')
      OR claims.client_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM claim_contractors
        WHERE claim_contractors.claim_id = claims.id
        AND claim_contractors.contractor_id = auth.uid()
      )
    )
  )
);

-- RLS policies for claim_checks
CREATE POLICY "Admins and staff can manage checks"
ON public.claim_checks FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

CREATE POLICY "Users can view checks for accessible claims"
ON public.claim_checks FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM claims
    WHERE claims.id = claim_checks.claim_id
    AND (
      has_role(auth.uid(), 'admin')
      OR has_role(auth.uid(), 'staff')
      OR claims.client_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM claim_contractors
        WHERE claim_contractors.claim_id = claims.id
        AND claim_contractors.contractor_id = auth.uid()
      )
    )
  )
);

-- RLS policies for claim_expenses
CREATE POLICY "Admins and staff can manage expenses"
ON public.claim_expenses FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

CREATE POLICY "Users can view expenses for accessible claims"
ON public.claim_expenses FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM claims
    WHERE claims.id = claim_expenses.claim_id
    AND (
      has_role(auth.uid(), 'admin')
      OR has_role(auth.uid(), 'staff')
      OR claims.client_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM claim_contractors
        WHERE claim_contractors.claim_id = claims.id
        AND claim_contractors.contractor_id = auth.uid()
      )
    )
  )
);

-- RLS policies for claim_fees
CREATE POLICY "Admins and staff can manage fees"
ON public.claim_fees FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

CREATE POLICY "Staff can view fees for accessible claims"
ON public.claim_fees FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff')
);

-- Create indexes
CREATE INDEX idx_claim_settlements_claim_id ON claim_settlements(claim_id);
CREATE INDEX idx_claim_checks_claim_id ON claim_checks(claim_id);
CREATE INDEX idx_claim_expenses_claim_id ON claim_expenses(claim_id);
CREATE INDEX idx_claim_fees_claim_id ON claim_fees(claim_id);

-- Create updated_at triggers
CREATE TRIGGER update_claim_settlements_updated_at
BEFORE UPDATE ON public.claim_settlements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_claim_checks_updated_at
BEFORE UPDATE ON public.claim_checks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_claim_expenses_updated_at
BEFORE UPDATE ON public.claim_expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_claim_fees_updated_at
BEFORE UPDATE ON public.claim_fees
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();