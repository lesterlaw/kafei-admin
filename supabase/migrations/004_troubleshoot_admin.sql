-- Quick fix: Temporarily disable RLS on admins table for testing
-- WARNING: Only use this for initial setup, then re-enable RLS

-- Option 1: Temporarily disable RLS (for testing only)
-- ALTER TABLE public.admins DISABLE ROW LEVEL SECURITY;

-- Option 2: Create a more permissive policy for initial setup
-- This allows any authenticated user to read admins (for checking admin status)
-- DROP POLICY IF EXISTS "Users can check own admin status" ON public.admins;
-- CREATE POLICY "Authenticated users can check admin status" ON public.admins
--     FOR SELECT USING (auth.uid() IS NOT NULL);

-- Option 3: Verify admin exists and manually grant access
-- Check if admin exists:
SELECT 
    au.id,
    au.email,
    au.email_confirmed_at,
    CASE WHEN a.id IS NOT NULL THEN 'Yes' ELSE 'No' END as is_admin,
    a.full_name
FROM auth.users au
LEFT JOIN public.admins a ON a.id = au.id
WHERE au.email = 'admin@admin.com';

-- If admin record doesn't exist but auth user does, create it:
-- INSERT INTO public.admins (id, email, full_name)
-- SELECT id, email, 'Admin User'
-- FROM auth.users
-- WHERE email = 'admin@admin.com'
-- ON CONFLICT (id) DO NOTHING;

