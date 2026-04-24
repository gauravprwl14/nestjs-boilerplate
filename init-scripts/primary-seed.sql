-- Insert 200K hot orders (last 90 days)
INSERT INTO orders_recent (user_id, order_number, total_amount, status, shipping_address, payment_method, payment_last4, coupon_code, created_at, updated_at)
SELECT
    (gs % 10000 + 1)::BIGINT,
    'ORD-HOT-' || lpad(gs::text, 8, '0'),
    round((50 + (gs % 9950))::numeric + 0.99, 2),
    (ARRAY['pending','confirmed','shipped','delivered','cancelled'])[1 + (gs % 5)],
    jsonb_build_object(
        'name',    'Customer ' || (gs % 10000 + 1),
        'line1',   (gs % 999 + 1)::text || ' MG Road',
        'city',    (ARRAY['Mumbai','Delhi','Bengaluru','Chennai','Hyderabad','Pune','Kolkata','Ahmedabad'])[1 + (gs % 8)],
        'state',   (ARRAY['MH','DL','KA','TN','TS','MH','WB','GJ'])[1 + (gs % 8)],
        'pincode', lpad(((gs % 900000) + 100000)::text, 6, '0'),
        'country', 'IN'
    ),
    (ARRAY['credit_card','upi','cod','wallet'])[1 + (gs % 4)],
    CASE WHEN gs % 4 = 0 THEN lpad((gs % 10000)::text, 4, '0') ELSE NULL END,
    CASE WHEN gs % 10 = 0 THEN 'SAVE' || (10 + gs % 30)::text ELSE NULL END,
    NOW() - ((gs % 90)::text || ' days')::INTERVAL - ((gs % 86400)::text || ' seconds')::INTERVAL,
    NOW() - ((gs % 90)::text || ' days')::INTERVAL
FROM generate_series(1, 200000) gs;

-- Insert items (3 items per order, 3 passes with different products)
INSERT INTO order_items_recent (order_id, product_id, quantity, unit_price, discount_amount, tax_amount, created_at)
SELECT
    o.order_id,
    ((o.order_id + pass - 1) % 30 + 1)::BIGINT,
    (1 + (o.order_id % 5))::INT,
    p.price,
    round((p.price * 0.05 * (o.order_id % 3))::numeric, 2),
    round((p.price * 0.18)::numeric, 2),
    o.created_at
FROM orders_recent o
CROSS JOIN generate_series(1, 3) pass
JOIN products p ON p.product_id = ((o.order_id + pass - 1) % 30 + 1);

-- Populate user_order_index for hot tier
INSERT INTO user_order_index (user_id, order_id, created_at, tier, archive_location)
SELECT user_id, order_id, created_at, 2, NULL
FROM orders_recent
ON CONFLICT DO NOTHING;
