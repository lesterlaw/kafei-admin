-- Add RLS policies for orders table to allow users to create their own orders

-- Users can create orders for themselves
CREATE POLICY "Users can create own orders" ON public.orders
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins can create orders for any user
CREATE POLICY "Admins can create orders" ON public.orders
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.admins
            WHERE id = auth.uid()
        )
    );

-- Users can update their own orders (e.g., cancel)
CREATE POLICY "Users can update own orders" ON public.orders
    FOR UPDATE USING (auth.uid() = user_id);

-- Admins can update any order
CREATE POLICY "Admins can update all orders" ON public.orders
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.admins
            WHERE id = auth.uid()
        )
    );

-- Add RLS policies for order_items

-- Users can view their own order items
CREATE POLICY "Users can view own order items" ON public.order_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_items.order_id
            AND orders.user_id = auth.uid()
        )
    );

-- Users can create order items for their own orders
CREATE POLICY "Users can create own order items" ON public.order_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_items.order_id
            AND orders.user_id = auth.uid()
        )
    );

-- Admins can view all order items
CREATE POLICY "Admins can view all order items" ON public.order_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.admins
            WHERE id = auth.uid()
        )
    );

-- Admins can create any order items
CREATE POLICY "Admins can create order items" ON public.order_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.admins
            WHERE id = auth.uid()
        )
    );

-- Add policy to allow users to insert their own record
CREATE POLICY "Users can insert own profile" ON public.users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow service role / anonymous to insert (for dev mode)
-- This is needed because dev mode creates users without auth.uid()
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;

