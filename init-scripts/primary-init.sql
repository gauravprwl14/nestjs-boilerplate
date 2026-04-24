-- Replication user (must exist before replicas connect)
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'replicator_pass';

-- Products (30 realistic items)
CREATE TABLE IF NOT EXISTS products (
    product_id          BIGSERIAL PRIMARY KEY,
    name                VARCHAR(255) NOT NULL,
    sku                 VARCHAR(50)  UNIQUE NOT NULL,
    category            VARCHAR(100) NOT NULL,
    price               DECIMAL(10,2) NOT NULL,
    brand               VARCHAR(100),
    total_orders_count  INT DEFAULT 0,
    recent_orders_count INT DEFAULT 0
);

INSERT INTO products (name, sku, category, price, brand) VALUES
('iPhone 15 Pro 256GB', 'APPL-IP15P-256', 'Electronics', 134900.00, 'Apple'),
('Samsung Galaxy S24 Ultra', 'SAMS-GS24U-001', 'Electronics', 129999.00, 'Samsung'),
('Sony WH-1000XM5', 'SONY-WH1000-XM5', 'Electronics', 29990.00, 'Sony'),
('MacBook Air M3', 'APPL-MBA-M3-256', 'Computers', 114900.00, 'Apple'),
('Dell XPS 15', 'DELL-XPS15-001', 'Computers', 159990.00, 'Dell'),
('Nike Air Max 270', 'NIKE-AM270-BLK', 'Footwear', 12995.00, 'Nike'),
('Adidas Ultraboost 23', 'ADID-UB23-WHT', 'Footwear', 17999.00, 'Adidas'),
('Levi''s 511 Slim Jeans', 'LEVI-511-32W', 'Apparel', 4999.00, 'Levi''s'),
('Uniqlo Merino Sweater', 'UNIQ-MER-BLU-M', 'Apparel', 3990.00, 'Uniqlo'),
('Instant Pot Duo 7-in-1', 'INST-DUO-7QT', 'Kitchen', 8999.00, 'Instant Pot'),
('Dyson V15 Detect', 'DYSO-V15-DET', 'Appliances', 65900.00, 'Dyson'),
('Kindle Paperwhite', 'AMZN-KPW-16GB', 'Electronics', 14999.00, 'Amazon'),
('JBL Flip 6', 'JBL-FLIP6-BLK', 'Electronics', 11999.00, 'JBL'),
('IKEA MALM Bed Frame', 'IKEA-MALM-QN', 'Furniture', 21999.00, 'IKEA'),
('Philips Air Fryer XXL', 'PHIL-AF-XXL', 'Kitchen', 12995.00, 'Philips'),
('Casio G-Shock GA-2100', 'CASI-GA2100-BLK', 'Watches', 7995.00, 'Casio'),
('HP LaserJet Pro M404n', 'HP-LJ-M404N', 'Computers', 22490.00, 'HP'),
('Bose QuietComfort 45', 'BOSE-QC45-BLK', 'Electronics', 24900.00, 'Bose'),
('Nestle Munch Pack', 'NEST-MNCH-PK12', 'Grocery', 240.00, 'Nestle'),
('Amul Butter 500g', 'AMUL-BUT-500G', 'Grocery', 285.00, 'Amul'),
('Tata Sampann Dal 1kg', 'TATA-DALP-1KG', 'Grocery', 145.00, 'Tata'),
('Woodland Waterproof Boots', 'WOOD-WTRPF-9', 'Footwear', 5999.00, 'Woodland'),
('Arrow Formal Shirt XL', 'ARRW-FRM-XL-BL', 'Apparel', 1799.00, 'Arrow'),
('Milton Thermosteel Flask', 'MILT-THER-1L', 'Kitchen', 799.00, 'Milton'),
('Prestige Pressure Cooker', 'PRES-PC-5L', 'Kitchen', 1499.00, 'Prestige'),
('Boat Rockerz 550', 'BOAT-RK550-BLU', 'Electronics', 2999.00, 'Boat'),
('Realme Narzo 60 Pro', 'RLME-N60P-8GB', 'Electronics', 23999.00, 'Realme'),
('Asian Paints Royale 4L', 'ASIAN-ROY-4L-W', 'Home', 2650.00, 'Asian Paints'),
('Usha Table Fan 400mm', 'USHA-TF400-WHT', 'Appliances', 2199.00, 'Usha'),
('Himalaya Neem Face Wash', 'HIMA-NFW-150ML', 'Personal Care', 175.00, 'Himalaya');

-- Hot orders table
CREATE TABLE IF NOT EXISTS orders_recent (
    order_id         BIGSERIAL PRIMARY KEY,
    user_id          BIGINT NOT NULL,
    order_number     VARCHAR(50) UNIQUE NOT NULL,
    total_amount     DECIMAL(10,2) NOT NULL,
    status           VARCHAR(20) NOT NULL,
    shipping_address JSONB NOT NULL,
    payment_method   VARCHAR(20) NOT NULL,
    payment_last4    VARCHAR(4),
    coupon_code      VARCHAR(50),
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders_recent(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created      ON orders_recent(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status       ON orders_recent(status);

-- Hot order items
CREATE TABLE IF NOT EXISTS order_items_recent (
    item_id         BIGSERIAL PRIMARY KEY,
    order_id        BIGINT NOT NULL REFERENCES orders_recent(order_id) ON DELETE CASCADE,
    product_id      BIGINT NOT NULL REFERENCES products(product_id),
    quantity        INT NOT NULL,
    unit_price      DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    tax_amount      DECIMAL(10,2) DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_items_order   ON order_items_recent(order_id);
CREATE INDEX IF NOT EXISTS idx_items_product ON order_items_recent(product_id);

-- Universal user-order lookup index
CREATE TABLE IF NOT EXISTS user_order_index (
    user_id          BIGINT NOT NULL,
    order_id         BIGINT NOT NULL,
    created_at       TIMESTAMP NOT NULL,
    tier             SMALLINT NOT NULL,
    archive_location VARCHAR(100),
    PRIMARY KEY (user_id, created_at DESC, order_id)
);
CREATE INDEX IF NOT EXISTS idx_uoi_order_id ON user_order_index(order_id);
CREATE INDEX IF NOT EXISTS idx_uoi_tier     ON user_order_index(tier);

-- Archive DB registry
CREATE TABLE IF NOT EXISTS archive_databases (
    id             SERIAL PRIMARY KEY,
    archive_year   INT NOT NULL,
    database_name  VARCHAR(100) NOT NULL,
    host           VARCHAR(255) NOT NULL,
    port           INT NOT NULL DEFAULT 5432,
    tier           SMALLINT NOT NULL,
    is_active      BOOLEAN DEFAULT TRUE,
    created_at     TIMESTAMP DEFAULT NOW()
);

-- Partition simulation
CREATE TABLE IF NOT EXISTS partition_simulation (
    id             SERIAL PRIMARY KEY,
    partition_date DATE NOT NULL,
    is_rotated     BOOLEAN DEFAULT FALSE,
    rotated_at     TIMESTAMP,
    records_moved  INT DEFAULT 0
);

-- Register archive databases
INSERT INTO archive_databases (archive_year, database_name, host, port, tier) VALUES
(2024, 'metadata_archive_db', 'metadata-archive-db', 5432, 3),
(2023, 'archive_2023',        'archive-2023',        5432, 4),
(2024, 'archive_2024',        'archive-2024',        5432, 4),
(2025, 'archive_2025',        'archive-2025',        5432, 4)
ON CONFLICT DO NOTHING;
