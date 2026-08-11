-- Cached CofePlus pods + menu items from Sync (used by admin + mapping into kiosks/products)

CREATE TABLE IF NOT EXISTS public.cofeplus_pods (
  pod_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('test', 'live')),
  display TEXT NOT NULL,
  raw JSONB DEFAULT '{}'::jsonb,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (environment, pod_id)
);

CREATE TABLE IF NOT EXISTS public.cofeplus_menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment TEXT NOT NULL CHECK (environment IN ('test', 'live')),
  pod_id TEXT NOT NULL,
  item_code TEXT NOT NULL,
  display TEXT NOT NULL,
  category TEXT,
  price DECIMAL(10, 2) DEFAULT 0 NOT NULL,
  out_of_stock BOOLEAN DEFAULT FALSE NOT NULL,
  modifiers JSONB DEFAULT '[]'::jsonb,
  raw JSONB DEFAULT '{}'::jsonb,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE (environment, pod_id, item_code)
);

CREATE INDEX IF NOT EXISTS idx_cofeplus_menu_items_pod
  ON public.cofeplus_menu_items (environment, pod_id);

CREATE INDEX IF NOT EXISTS idx_cofeplus_menu_items_code
  ON public.cofeplus_menu_items (item_code);

CREATE TABLE IF NOT EXISTS public.cofeplus_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment TEXT NOT NULL CHECK (environment IN ('test', 'live')),
  pod_id TEXT,
  pods_synced INTEGER DEFAULT 0 NOT NULL,
  items_synced INTEGER DEFAULT 0 NOT NULL,
  kiosks_upserted INTEGER DEFAULT 0 NOT NULL,
  products_upserted INTEGER DEFAULT 0 NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.cofeplus_pods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cofeplus_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cofeplus_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage cofeplus_pods" ON public.cofeplus_pods
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid())
  );

CREATE POLICY "Admins manage cofeplus_menu_items" ON public.cofeplus_menu_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid())
  );

CREATE POLICY "Admins manage cofeplus_sync_runs" ON public.cofeplus_sync_runs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid())
  );
