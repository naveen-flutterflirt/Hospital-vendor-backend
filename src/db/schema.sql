-- ====================================================================
-- Hospital Inventory & Vendor Management CRM Database Schema
-- Dialect: PostgreSQL 14+
-- ====================================================================

-- 1. Enable UUID Extension (if needed)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Drop Tables if already existing (for clean migration runs)
DROP TABLE IF EXISTS reports CASCADE;
DROP TABLE IF EXISTS asset_maintenance_logs CASCADE;
DROP TABLE IF EXISTS assets CASCADE;
DROP TABLE IF EXISTS invoice_payments CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS stock_transfer_items CASCADE;
DROP TABLE IF EXISTS stock_transfers CASCADE;
DROP TABLE IF EXISTS grn_items CASCADE;
DROP TABLE IF EXISTS grns CASCADE;
DROP TABLE IF EXISTS purchase_order_items CASCADE;
DROP TABLE IF EXISTS purchase_orders CASCADE;
DROP TABLE IF EXISTS rfq_quote_items CASCADE;
DROP TABLE IF EXISTS rfq_quotes CASCADE;
DROP TABLE IF EXISTS rfq_items CASCADE;
DROP TABLE IF EXISTS rfqs CASCADE;
DROP TABLE IF EXISTS purchase_request_items CASCADE;
DROP TABLE IF EXISTS purchase_requests CASCADE;
DROP TABLE IF EXISTS indent_items CASCADE;
DROP TABLE IF EXISTS indents CASCADE;
DROP TABLE IF EXISTS batches CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS vendors CASCADE;
DROP TABLE IF EXISTS stores CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 3. Users & Identity (RBAC)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(100) NOT NULL,
    department VARCHAR(255) DEFAULT 'General Medicine',
    branch VARCHAR(255) DEFAULT 'Main Campus',
    avatar_initials VARCHAR(10) DEFAULT 'MD',
    badge VARCHAR(100) DEFAULT 'Staff',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Stores & Hospital Warehouse Locations
CREATE TABLE stores (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    branch VARCHAR(255) NOT NULL,
    store_type VARCHAR(50) NOT NULL, -- 'Central', 'Pharmacy', 'ICU', 'Wards', 'OT', 'Emergency'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Approved Medical Vendors
CREATE TABLE vendors (
    id SERIAL PRIMARY KEY,
    vendor_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL, -- 'Pharmacy', 'Implants', 'Consumables', 'Capex', 'Lab Supplies', 'Services'
    contact_email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    gstin VARCHAR(50),
    pan VARCHAR(50),
    score NUMERIC(5, 2) DEFAULT 90.0,
    grade VARCHAR(10) DEFAULT 'A',
    status VARCHAR(50) DEFAULT 'Active', -- 'Active', 'Onboarding', 'Suspended'
    payment_terms VARCHAR(100) DEFAULT 'Net 30',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Items & Formulary Master Catalog
CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    item_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    generic_name VARCHAR(255),
    category VARCHAR(100) NOT NULL,
    form VARCHAR(100) DEFAULT 'unit',
    hsn_code VARCHAR(50) DEFAULT '3004',
    gst_rate NUMERIC(5, 2) DEFAULT 12.00,
    uom VARCHAR(100) DEFAULT 'box',
    class_vital VARCHAR(50) DEFAULT 'Vital · A-class',
    schedule_type VARCHAR(50) DEFAULT 'Schedule H',
    is_patient_chargeable BOOLEAN DEFAULT TRUE,
    total_on_hand INTEGER DEFAULT 0,
    avg_daily_use NUMERIC(10, 2) DEFAULT 0,
    target_cover_days NUMERIC(10, 2) DEFAULT 30,
    reorder_level INTEGER DEFAULT 900,
    reorder_qty INTEGER DEFAULT 2000,
    last_rate NUMERIC(12, 2) DEFAULT 0.00,
    rate_contract_expiry VARCHAR(50) DEFAULT 'Rate contract to Mar-27',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Batches & FEFO Stock Storage
CREATE TABLE batches (
    id SERIAL PRIMARY KEY,
    item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
    batch_number VARCHAR(100) NOT NULL,
    store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
    bin_location VARCHAR(100) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    expiry_date VARCHAR(50) NOT NULL,
    mrp NUMERIC(10, 2) NOT NULL,
    purchase_rate NUMERIC(10, 2) NOT NULL,
    vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'Available', -- 'Available', 'Near expiry', 'Issue first', 'QC pending'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Ward & Store Indents
CREATE TABLE indents (
    id SERIAL PRIMARY KEY,
    indent_number VARCHAR(50) UNIQUE NOT NULL,
    requesting_dept VARCHAR(100) NOT NULL,
    to_store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
    priority VARCHAR(50) DEFAULT 'Routine', -- 'Routine', 'Urgent', 'Emergency'
    status VARCHAR(50) DEFAULT 'Pending', -- 'Pending', 'Processing', 'Partially Issued', 'Completed'
    raised_by_name VARCHAR(255) NOT NULL,
    raised_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    total_items_count INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE indent_items (
    id SERIAL PRIMARY KEY,
    indent_id INTEGER REFERENCES indents(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES items(id) ON DELETE RESTRICT,
    requested_qty INTEGER NOT NULL,
    issued_qty INTEGER DEFAULT 0,
    remarks TEXT
);

-- 9. Purchase Requests (PR)
CREATE TABLE purchase_requests (
    id SERIAL PRIMARY KEY,
    pr_number VARCHAR(50) UNIQUE NOT NULL,
    source VARCHAR(100) DEFAULT 'Manual', -- 'Auto-reorder', 'Manual', 'Indent Escalation'
    department VARCHAR(100) NOT NULL,
    items_count INTEGER DEFAULT 1,
    estimated_value NUMERIC(12, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending L1', -- 'Pending L1', 'Pending CFO', 'Approved', 'Rejected'
    raised_by_name VARCHAR(255) NOT NULL,
    raised_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE purchase_request_items (
    id SERIAL PRIMARY KEY,
    pr_id INTEGER REFERENCES purchase_requests(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES items(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    estimated_unit_rate NUMERIC(10, 2) NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL
);

-- 10. Request For Quotations (RFQ) & Vendor Quotes
CREATE TABLE rfqs (
    id SERIAL PRIMARY KEY,
    rfq_number VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    pr_id INTEGER REFERENCES purchase_requests(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'Published', -- 'Draft', 'Published', 'Evaluation', 'Awarded', 'Closed'
    closing_date TIMESTAMP WITH TIME ZONE,
    awarded_vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rfq_items (
    id SERIAL PRIMARY KEY,
    rfq_id INTEGER REFERENCES rfqs(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES items(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    target_unit_rate NUMERIC(10, 2)
);

CREATE TABLE rfq_quotes (
    id SERIAL PRIMARY KEY,
    rfq_id INTEGER REFERENCES rfqs(id) ON DELETE CASCADE,
    vendor_id INTEGER REFERENCES vendors(id) ON DELETE CASCADE,
    quote_ref VARCHAR(100),
    delivery_lead_days INTEGER DEFAULT 7,
    total_quoted_amount NUMERIC(12, 2) NOT NULL,
    is_awarded BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'Submitted', -- 'Submitted', 'Negotiating', 'Awarded', 'Rejected'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rfq_quote_items (
    id SERIAL PRIMARY KEY,
    quote_id INTEGER REFERENCES rfq_quotes(id) ON DELETE CASCADE,
    rfq_item_id INTEGER REFERENCES rfq_items(id) ON DELETE CASCADE,
    unit_price NUMERIC(10, 2) NOT NULL,
    tax_percent NUMERIC(5, 2) DEFAULT 12.0,
    total_price NUMERIC(12, 2) NOT NULL
);

-- 11. Purchase Orders (PO)
CREATE TABLE purchase_orders (
    id SERIAL PRIMARY KEY,
    po_number VARCHAR(50) UNIQUE NOT NULL,
    vendor_id INTEGER REFERENCES vendors(id) ON DELETE RESTRICT,
    rfq_id INTEGER REFERENCES rfqs(id) ON DELETE SET NULL,
    pr_id INTEGER REFERENCES purchase_requests(id) ON DELETE SET NULL,
    po_type VARCHAR(50) DEFAULT 'Regular PO', -- 'Regular PO', 'Rate-contract PO', 'Blanket PO', 'Consignment', 'Capex PO', 'Emergency purchase'
    items_count INTEGER DEFAULT 1,
    total_value NUMERIC(12, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'Dispatched', -- 'Draft', 'Awaiting approval', 'Accepted', 'Dispatched', 'Overdue', 'Completed', 'Cancelled'
    due_date VARCHAR(50) DEFAULT 'In 7 days',
    payment_terms VARCHAR(100) DEFAULT 'Net 30',
    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE purchase_order_items (
    id SERIAL PRIMARY KEY,
    po_id INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES items(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,
    tax_percent NUMERIC(5, 2) DEFAULT 12.0,
    line_total NUMERIC(12, 2) NOT NULL
);

-- 12. Goods Receipt Notes (GRN) & Quality Control (QC)
CREATE TABLE grns (
    id SERIAL PRIMARY KEY,
    grn_number VARCHAR(50) UNIQUE NOT NULL,
    po_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,
    po_ref VARCHAR(50) NOT NULL,
    vendor_id INTEGER REFERENCES vendors(id) ON DELETE RESTRICT,
    lines_count INTEGER DEFAULT 1,
    shortage_notes VARCHAR(255) DEFAULT '-',
    received_date VARCHAR(50) DEFAULT 'Today',
    status VARCHAR(50) DEFAULT 'Pending QC', -- 'Expected', 'Pending QC', 'QC Passed', 'Partial Reject', 'QC Failed'
    inspector_name VARCHAR(255) DEFAULT 'Lead QC Inspector',
    cold_chain_compliant BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. Issues & Internal Stock Transfers
CREATE TABLE stock_transfers (
    id SERIAL PRIMARY KEY,
    transfer_number VARCHAR(50) UNIQUE NOT NULL,
    transfer_type VARCHAR(50) NOT NULL, -- 'Ward Issue', 'Patient Issue', 'Store Transfer', 'Ward Return'
    from_location VARCHAR(100) NOT NULL,
    to_location VARCHAR(100) NOT NULL,
    lines_count INTEGER DEFAULT 1,
    status VARCHAR(50) DEFAULT 'Completed', -- 'Completed', 'In Transit', 'Pending', 'Cancelled'
    issued_by_name VARCHAR(255) DEFAULT 'Store In-charge',
    transfer_date VARCHAR(100) DEFAULT 'Today, 10:30 AM',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. Invoices & Accounts Payable (AP)
CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    po_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,
    po_ref VARCHAR(50) NOT NULL,
    vendor_id INTEGER REFERENCES vendors(id) ON DELETE RESTRICT,
    amount NUMERIC(12, 2) NOT NULL,
    due_date VARCHAR(50) DEFAULT 'In 15 days',
    status VARCHAR(50) DEFAULT 'Pending', -- 'Pending', 'Processing', 'Overdue', 'Paid', 'Pending GRN'
    payment_ref VARCHAR(100),
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 15. Capital Assets & AMC Maintenance
CREATE TABLE assets (
    id SERIAL PRIMARY KEY,
    asset_tag VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    serial_no VARCHAR(100) UNIQUE NOT NULL,
    department VARCHAR(100) NOT NULL,
    vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
    vendor_name VARCHAR(255) NOT NULL,
    amc_expiry VARCHAR(100) DEFAULT 'Valid for 120 days',
    amc_alert BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'Active', -- 'Active', 'In Maintenance', 'Out of Service'
    purchase_cost NUMERIC(14, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 16. Audit & Business Reports
CREATE TABLE reports (
    id SERIAL PRIMARY KEY,
    report_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    report_type VARCHAR(100) NOT NULL,
    file_size VARCHAR(50) DEFAULT '1.2 MB',
    generated_date VARCHAR(50) DEFAULT 'Today',
    download_url VARCHAR(255) DEFAULT '#',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 17. Revoked Tokens / Token Blacklist (Production Auth Security)
CREATE TABLE IF NOT EXISTS revoked_tokens (
    id SERIAL PRIMARY KEY,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    reason VARCHAR(100) DEFAULT 'USER_LOGOUT',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 18. Session & Activity Audit Logs (HIPAA / Enterprise Security Audit Trail)
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    ip_address VARCHAR(100),
    user_agent TEXT,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 19. Create Key Indexes for Performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_items_code ON items(item_code);
CREATE INDEX idx_batches_item ON batches(item_id);
CREATE INDEX idx_indents_status ON indents(status);
CREATE INDEX idx_purchase_requests_status ON purchase_requests(status);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX idx_grns_status ON grns(status);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_assets_dept ON assets(department);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_hash ON revoked_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expiry ON revoked_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

