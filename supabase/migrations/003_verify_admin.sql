-- Verify and fix admin access
-- Run this in Supabase SQL Editor to check admin setup

-- Check if admin user exists
SELECT 
    au.id,
    au.email,
    au.email_confirmed_at,
    CASE WHEN a.id IS NOT NULL THEN 'Yes' ELSE 'No' END as is_admin
FROM auth.users au
LEFT JOIN public.admins a ON a.id = au.id
WHERE au.email = 'admin@admin.com';

-- If admin record doesn't exist, create it manually:
-- Replace USER_ID_HERE with the actual user ID from the query above
-- INSERT INTO public.admins (id, email, full_name)
-- VALUES ('USER_ID_HERE', 'admin@admin.com', 'Admin User')
-- ON CONFLICT (id) DO NOTHING;

-- Verify RLS policies exist
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'admins'
ORDER BY policyname;

