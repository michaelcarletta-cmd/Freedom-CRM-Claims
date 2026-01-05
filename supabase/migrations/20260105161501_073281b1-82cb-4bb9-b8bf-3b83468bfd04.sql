-- Create table for outstanding checks tracker
CREATE TABLE public.outstanding_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  check_number TEXT,
  payee TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for bank balance tracking
CREATE TABLE public.bank_balance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  balance NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.outstanding_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_balance ENABLE ROW LEVEL SECURITY;

-- Create policies for admin access only
CREATE POLICY "Admins can view outstanding checks" 
ON public.outstanding_checks 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can insert outstanding checks" 
ON public.outstanding_checks 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Admins can update outstanding checks" 
ON public.outstanding_checks 
FOR UPDATE 
USING (true);

CREATE POLICY "Admins can delete outstanding checks" 
ON public.outstanding_checks 
FOR DELETE 
USING (true);

CREATE POLICY "Admins can view bank balance" 
ON public.bank_balance 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can insert bank balance" 
ON public.bank_balance 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Admins can update bank balance" 
ON public.bank_balance 
FOR UPDATE 
USING (true);

-- Create trigger to update updated_at
CREATE TRIGGER update_outstanding_checks_updated_at
BEFORE UPDATE ON public.outstanding_checks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bank_balance_updated_at
BEFORE UPDATE ON public.bank_balance
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();