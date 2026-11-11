-- Sign-up details from the app's "Let's get to know you" screen (SLP-1721).
-- user_role is self-declared and never grants anything: free drinks stay on is_staff.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS campus TEXT,
  ADD COLUMN IF NOT EXISTS user_role TEXT CHECK (user_role IN ('student', 'staff', 'other')),
  ADD COLUMN IF NOT EXISTS study_year SMALLINT CHECK (study_year BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.campus IS 'Campus picked at sign-up (a kiosk location).';
COMMENT ON COLUMN public.users.user_role IS 'Self-declared at sign-up: student, staff or other. Not the staff free-drink flag.';
COMMENT ON COLUMN public.users.study_year IS 'Year of study (1 to 4), students only.';
COMMENT ON COLUMN public.users.marketing_opt_in IS 'Agreed to KAFEI offers and updates at sign-up.';
