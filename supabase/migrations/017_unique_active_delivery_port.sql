-- Two queued activations must not share the same dispense hole.
CREATE UNIQUE INDEX IF NOT EXISTS orders_active_delivery_port_uidx
ON public.orders (cofeplus_pod_id, cofeplus_environment, delivery_port)
WHERE status IN ('pending', 'brewing', 'ready')
  AND delivery_port IN (1, 2);
