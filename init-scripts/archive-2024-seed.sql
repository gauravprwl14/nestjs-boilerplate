\i /docker-entrypoint-initdb.d/archive-init.sql

INSERT INTO archived_orders (order_id, user_id, order_number, total_amount, status, shipping_address, payment_method, coupon_code, created_at)
SELECT
    3000000 + gs,
    (gs % 10000 + 1)::BIGINT,
    'ORD-C24-' || lpad(gs::text, 8, '0'),
    round((50 + (gs % 9950))::numeric + 0.49, 2),
    (ARRAY['delivered','cancelled','returned','delivered','delivered'])[1 + (gs % 5)],
    jsonb_build_object('name','Customer '||(gs%10000+1),'line1',gs||' Lake Rd','city',(ARRAY['Pune','Kolkata','Ahmedabad','Surat','Jaipur'])[1+(gs%5)],'state',(ARRAY['MH','WB','GJ','GJ','RJ'])[1+(gs%5)],'pincode',lpad(((gs%900000)+100000)::text,6,'0'),'country','IN'),
    (ARRAY['credit_card','upi','cod','wallet'])[1 + (gs % 4)],
    CASE WHEN gs % 12 = 0 THEN 'FLAT' || (50 + gs % 200)::text ELSE NULL END,
    TIMESTAMP '2024-01-01' + ((gs % 366)::text || ' days')::INTERVAL
FROM generate_series(1, 650000) gs;

INSERT INTO archived_order_items (item_id, order_id, product_id, product_name, quantity, unit_price, discount_amount, tax_amount, created_at)
SELECT
    (3000000 + o.gs) * 10 + pass,
    3000000 + o.gs,
    ((o.gs + pass) % 30 + 1)::BIGINT,
    'Product ' || (((o.gs + pass) % 30) + 1)::text,
    (1 + (o.gs % 3))::INT,
    round((100 + (o.gs % 5000))::numeric + 0.49, 2),
    round(((o.gs % 400))::numeric, 2),
    round(((o.gs % 1600))::numeric, 2),
    TIMESTAMP '2024-01-01' + ((o.gs % 366)::text || ' days')::INTERVAL
FROM generate_series(1, 650000) o(gs)
CROSS JOIN generate_series(1, 2) pass;
