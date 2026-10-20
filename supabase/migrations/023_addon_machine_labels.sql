-- Keep add-on names in step with the machine. The CofePlus sync kept the first
-- name it saw for each group/flag forever, so when the machine reassigned syrup
-- slots (sirup2 became Vanilla, sirup7 Salted Caramel) the app kept showing the
-- old names and customers got a different syrup from the one they picked.
--
-- cofeplus_display: the machine's current label for this group/flag (active
--   environment). The sync renames an add-on whose name still equals this label
--   when the machine label changes; an admin rename is kept instead.
-- cofeplus_display_changed_at: set when the machine label differs from a kept
--   admin name, so the add-ons page can ask for a review. Saving clears it.
ALTER TABLE public.add_ons
  ADD COLUMN IF NOT EXISTS cofeplus_display TEXT,
  ADD COLUMN IF NOT EXISTS cofeplus_display_changed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.add_ons.cofeplus_display IS
  'Machine label for cofeplus_group/cofeplus_flag as of the last sync of the active environment.';
COMMENT ON COLUMN public.add_ons.cofeplus_display_changed_at IS
  'When the machine label stopped matching an admin-set name. Cleared when the add-on is saved.';

-- Backfill from the cached menu of the active environment. Where a flag has
-- several labels across drinks, the most common one wins. Rows whose name
-- differs from the machine are flagged once for review.
WITH env AS (
  SELECT COALESCE(
    (SELECT value FROM public.app_settings WHERE key = 'cofeplus_environment'),
    'test'
  ) AS name
),
labels AS (
  SELECT
    g->>'group' AS grp,
    o->>'flag' AS flag,
    COALESCE(NULLIF(o->>'display', ''), o->>'flag') AS label,
    COUNT(*) AS uses
  FROM public.cofeplus_menu_items m
  CROSS JOIN env
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(m.raw->'modifierGroups') = 'array'
      THEN m.raw->'modifierGroups' ELSE '[]'::jsonb END
  ) g
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(g->'options') = 'array'
      THEN g->'options' ELSE '[]'::jsonb END
  ) o
  WHERE m.environment = env.name
    AND g->>'group' IS NOT NULL
    AND o->>'flag' IS NOT NULL
  GROUP BY 1, 2, 3
),
best AS (
  SELECT DISTINCT ON (grp, flag) grp, flag, label
  FROM labels
  ORDER BY grp, flag, uses DESC, label
)
UPDATE public.add_ons a
SET cofeplus_display = best.label,
    cofeplus_display_changed_at = CASE
      WHEN a.name <> best.label THEN TIMEZONE('utc'::text, NOW())
    END
FROM best
WHERE a.cofeplus_group = best.grp
  AND a.cofeplus_flag = best.flag
  AND a.cofeplus_display IS NULL;
