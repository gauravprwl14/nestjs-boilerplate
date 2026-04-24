CREATE TABLE IF NOT EXISTS archived_orders (
    order_id         BIGINT PRIMARY KEY,
    user_id          BIGINT NOT NULL,
    order_number     VARCHAR(50) NOT NULL,
    total_amount     DECIMAL(10,2) NOT NULL,
    status           VARCHAR(20) NOT NULL,
    shipping_address JSONB NOT NULL,
    payment_method   VARCHAR(20) NOT NULL,
    coupon_code      VARCHAR(50),
    created_at       TIMESTAMP NOT NULL,
    archived_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_arch_user    ON archived_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_arch_created ON archived_orders(created_at);

CREATE TABLE IF NOT EXISTS archived_order_items (
    item_id         BIGINT PRIMARY KEY,
    order_id        BIGINT NOT NULL REFERENCES archived_orders(order_id),
    product_id      BIGINT NOT NULL,
    product_name    VARCHAR(255) NOT NULL,
    quantity        INT NOT NULL,
    unit_price      DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    tax_amount      DECIMAL(10,2) DEFAULT 0,
    created_at      TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_arch_items_order ON archived_order_items(order_id);
