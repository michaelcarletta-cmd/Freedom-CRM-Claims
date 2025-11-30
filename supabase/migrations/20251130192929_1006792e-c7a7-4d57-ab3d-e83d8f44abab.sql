-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'staff', 'client', 'contractor');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create claims table
CREATE TABLE public.claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number TEXT UNIQUE NOT NULL,
  client_id UUID REFERENCES auth.users(id),
  
  -- Policyholder information
  policyholder_name TEXT NOT NULL,
  policyholder_email TEXT,
  policyholder_phone TEXT,
  policyholder_address TEXT,
  
  -- Loss information
  loss_date DATE,
  loss_type TEXT,
  loss_description TEXT,
  
  -- Insurance information
  insurance_company TEXT,
  insurance_phone TEXT,
  insurance_email TEXT,
  
  -- Adjuster information
  adjuster_name TEXT,
  adjuster_phone TEXT,
  adjuster_email TEXT,
  
  status TEXT DEFAULT 'open',
  claim_amount DECIMAL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create claim_contractors junction table
CREATE TABLE public.claim_contractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID REFERENCES public.claims(id) ON DELETE CASCADE NOT NULL,
  contractor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(claim_id, contractor_id)
);

-- Create claim_updates table
CREATE TABLE public.claim_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID REFERENCES public.claims(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  update_type TEXT, -- 'note', 'email', 'sms', 'status_change'
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_updates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- RLS Policies for claims
CREATE POLICY "Admins and staff can view all claims" ON public.claims FOR SELECT TO authenticated 
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Clients can view their claims" ON public.claims FOR SELECT TO authenticated 
  USING (client_id = auth.uid());

CREATE POLICY "Contractors can view assigned claims" ON public.claims FOR SELECT TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.claim_contractors WHERE claim_id = id AND contractor_id = auth.uid()));

CREATE POLICY "Admins and staff can manage claims" ON public.claims FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

-- RLS Policies for claim_contractors
CREATE POLICY "Admins and staff can manage contractors" ON public.claim_contractors FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE POLICY "All authenticated can view assignments" ON public.claim_contractors FOR SELECT TO authenticated USING (true);

-- RLS Policies for claim_updates
CREATE POLICY "Users can view updates for accessible claims" ON public.claim_updates FOR SELECT TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM public.claims WHERE id = claim_id AND (
      public.has_role(auth.uid(), 'admin') OR 
      public.has_role(auth.uid(), 'staff') OR 
      client_id = auth.uid() OR
      EXISTS (SELECT 1 FROM public.claim_contractors WHERE claim_id = claims.id AND contractor_id = auth.uid())
    ))
  );

CREATE POLICY "Authenticated users can create updates" ON public.claim_updates FOR INSERT TO authenticated 
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (SELECT 1 FROM public.claims WHERE id = claim_id AND (
      public.has_role(auth.uid(), 'admin') OR 
      public.has_role(auth.uid(), 'staff') OR 
      client_id = auth.uid() OR
      EXISTS (SELECT 1 FROM public.claim_contractors WHERE claim_id = claims.id AND contractor_id = auth.uid())
    ))
  );

-- Trigger for profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_claims_updated_at BEFORE UPDATE ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();