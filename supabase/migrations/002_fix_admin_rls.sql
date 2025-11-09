-- Fix RLS policies for admins table - Remove recursive policies
-- The issue is that "Admins can view all admins" policy causes infinite recursion
-- Solution: Only allow users to check their own admin status

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Users can check own admin status" ON public.admins;
DROP POLICY IF EXISTS "Admins can view all admins" ON public.admins;
DROP POLICY IF EXISTS "Admins can insert admins" ON public.admins;
DROP POLICY IF EXISTS "Admins can update admins" ON public.admins;
DROP POLICY IF EXISTS "Admins can delete admins" ON public.admins;

-- Only allow users to check if they themselves are admins
-- This is needed for authentication and doesn't cause recursion
CREATE POLICY "Users can check own admin status" ON public.admins
    FOR SELECT USING (auth.uid() = id);

-- For admin management operations, we'll use service role key in server actions
-- This avoids the recursion issue while maintaining security
