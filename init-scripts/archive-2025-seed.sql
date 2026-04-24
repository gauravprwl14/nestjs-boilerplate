\i /docker-entrypoint-initdb.d/archive-init.sql

INSERT INTO archived_orders (order_id, user_id, order_number, total_amount, status, shipping_address, payment_method, coupon_code, created_at)
SELECT
    4000000 + gs,
    (gs % 10000 + 1)::BIGINT,
    'ORD-C25-' || lpad(gs::text, 8, '0'),
    round((50 + (gs % 9950))::numeric + 0.79, 2),
    (ARRAY['delivered','shipped','confirmed','delivered','cancelled'])[1 + (gs % 5)],
    jsonb_build_object('name','Customer '||(gs%10000+1),'line1',gs||' Hill St','city',(ARRAY['Lucknow','Bhopal','Nagpur','Indore','Patna'])[1+(gs%5)],'state',(ARRAY['UP','MP','MH','MP','BR'])[1+(gs%5)],'pincode',lpad(((gs%900000)+100000)::text,6,'0'),'country','IN'),
    (ARRAY['credit_card','upi','cod','wallet'])[1 + (gs % 4)],
    CASE WHEN gs % 8 = 0 THEN 'NEW' || (20 + gs % 80)::text ELSE NULL END,
    TIMESTAMP '2025-01-01' + ((gs % 116)::text || ' days')::INTERVAL
FROM generate_series(1, 450000) gs;

INSERT INTO archived_order_items (item_id, order_id, product_id, product_name, quantity, unit_price, discount_amount, tax_amount, created_at)
SELECT
    (4000000 + o.gs) * 10 + pass,
    4000000 + o.gs,
    ((o.gs + pass) % 30 + 1)::BIGINT,
    'Product ' || (((o.gs + pass) % 30) + 1)::text,
    (1 + (o.gs % 3))::INT,
    round((100 + (o.gs % 5000))::numeric + 0.79, 2),
    round(((o.gs % 300))::numeric, 2),
    round(((o.gs % 1200))::numeric, 2),
    TIMESTAMP '2025-01-01' + ((o.gs % 116)::text || ' days')::INTERVAL
FROM generate_series(1, 450000) o(gs)
CROSS JOIN generate_series(1, 2) pass;
