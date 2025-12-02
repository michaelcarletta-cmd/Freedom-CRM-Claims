-- Fix profiles table RLS: restrict full profile access to admins/staff only
-- and allow users to view their own profile

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;

-- Create policy for admins and staff to view all profiles
CREATE POLICY "Staff can view all profiles" ON profiles
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

-- Create policy for users to view their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());