CREATE TABLE IF NOT EXISTS order_metadata_archive (
    order_id         BIGINT PRIMARY KEY,
    user_id          BIGINT NOT NULL,
    order_number     VARCHAR(50) NOT NULL,
    total_amount     DECIMAL(10,2) NOT NULL,
    status           VARCHAR(20) NOT NULL,
    payment_method   VARCHAR(20) NOT NULL,
    created_at       TIMESTAMP NOT NULL,
    archive_location VARCHAR(100) NOT NULL,
    archived_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meta_user_created ON order_metadata_archive(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_archive_loc  ON order_metadata_archive(archive_location);

-- 1M warm orders (2024 full year) — IDs start at 1000001
INSERT INTO order_metadata_archive (order_id, user_id, order_number, total_amount, status, payment_method, created_at, archive_location)
SELECT
    1000000 + gs,
    (gs % 10000 + 1)::BIGINT,
    'ORD-WRM-' || lpad(gs::text, 8, '0'),
    round((50 + (gs % 9950))::numeric + 0.49, 2),
    (ARRAY['delivered','cancelled','returned','delivered','delivered'])[1 + (gs % 5)],
    (ARRAY['credit_card','upi','cod','wallet'])[1 + (gs % 4)],
    TIMESTAMP '2024-01-01' + ((gs % 366)::text || ' days')::INTERVAL + ((gs % 86400)::text || ' seconds')::INTERVAL,
    'metadata_archive_db'
FROM generate_series(1, 1000000) gs;
