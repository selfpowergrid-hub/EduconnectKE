/**
 * Local SQLite schema — the tenant's offline slice (PRD §26 last para).
 * Mirrors server tables 1:1 in structure; stock_levels is folded locally
 * from stock_movements exactly like the Postgres trigger.
 * `outbox` holds unsynced events; rows are deleted ONLY after server ack.
 */
export const SCHEMA_VERSION = 1;

export const DDL: string[] = [
  `create table if not exists meta (
    key text primary key,
    value text not null
  )`,
  `create table if not exists outbox (
    event_id text primary key,
    client_seq integer not null,
    envelope text not null,          -- JSON EventEnvelope
    created_at text not null,
    rejected_error text              -- set when server says invalid; surfaced in sync health
  )`,
  `create table if not exists lww_meta (
    table_name text not null,
    row_id text not null,
    lww_ts text not null,
    lww_tiebreak text not null,
    primary key (table_name, row_id)
  )`,
  `create table if not exists products (
    id text primary key,
    name text not null,
    name_sw text,
    category_id text,
    unit text not null default 'pc',
    base_unit text not null default 'pc',
    sell_price_cents integer not null default 0,
    buy_price_cents_avg integer not null default 0,
    wholesale_price_cents integer,
    min_price_cents integer,
    vat_class text not null default 'exempt',
    reorder_level real,
    reorder_qty real,
    track_batches integer not null default 0,
    is_weight_item integer not null default 0,
    kg_price_cents integer,
    parent_product_id text,
    conversion_factor real,
    active integer not null default 1,
    deleted_at text
  )`,
  `create table if not exists barcodes (
    id text primary key,
    product_id text not null,
    code text not null unique
  )`,
  `create table if not exists batches (
    id text primary key,
    product_id text not null,
    batch_no text not null,
    expiry_date text,
    qty_in real not null default 0
  )`,
  `create table if not exists price_board_entries (
    id text primary key,
    product_id text not null,
    kg_price_cents integer not null,
    effective_from text not null
  )`,
  `create table if not exists customers (
    id text primary key,
    name text not null,
    phone text,
    id_number text,
    credit_limit_cents integer,
    notes text,
    opt_out_reminders integer not null default 0,
    deleted_at text
  )`,
  `create table if not exists customer_transactions (
    id text primary key,
    customer_id text not null,
    type text not null,
    amount_cents integer not null,
    sale_id text,
    payment_method text,
    mpesa_ref text,
    due_date text,
    note text,
    created_at text not null
  )`,
  `create table if not exists sales (
    id text primary key,
    receipt_no integer,
    device_receipt_ref text,
    status text not null default 'completed',
    sold_by text,
    customer_id text,
    subtotal_cents integer not null default 0,
    discount_cents integer not null default 0,
    vat_cents integer not null default 0,
    total_cents integer not null default 0,
    parked_label text,
    sold_at text not null
  )`,
  `create table if not exists sale_lines (
    id text primary key,
    sale_id text not null,
    product_id text not null,
    batch_id text,
    qty real not null,
    unit text not null,
    weight_kg real,
    unit_price_cents integer not null,
    line_total_cents integer not null,
    vat_class text not null,
    vat_cents integer not null default 0
  )`,
  `create table if not exists payments (
    id text primary key,
    sale_id text,
    customer_id text,
    tender text not null,
    amount_cents integer not null,
    mpesa_ref text,
    mpesa_phone text,
    matched integer not null default 1,
    created_at text not null
  )`,
  `create table if not exists stock_movements (
    id text primary key,
    branch_id text,
    product_id text not null,
    batch_id text,
    type text not null,
    qty_delta real not null,
    unit_cost_cents integer,
    reason_code text,
    ref_table text,
    ref_id text,
    created_at text not null
  )`,
  `create table if not exists stock_levels (
    product_id text primary key,
    qty real not null default 0,
    valuation_cents integer not null default 0
  )`,
  `create table if not exists users (
    id text primary key,
    full_name text not null,
    phone text,
    role text not null default 'attendant',
    pin_hash text,
    active integer not null default 1
  )`,
  `create table if not exists expenses (
    id text primary key,
    category text not null,
    amount_cents integer not null,
    note text,
    incurred_at text not null
  )`,
  `create table if not exists cash_movements (
    id text primary key,
    shift_id text,
    type text not null,
    amount_cents integer not null,
    reason text,
    created_at text not null
  )`,
  `create table if not exists shifts (
    id text primary key,
    branch_id text,
    opened_by text,
    opened_at text not null,
    closed_at text,
    expected_cash_cents integer,
    counted_cash_cents integer,
    variance_cents integer
  )`,
  `create table if not exists day_closes (
    id text primary key,
    branch_id text,
    business_date text not null,
    totals text not null default '{}',
    variance_cents integer
  )`,
  `create table if not exists grns (
    id text primary key,
    po_id text,
    supplier_id text not null,
    ref text,
    received_at text not null
  )`,
  `create table if not exists grn_lines (
    id text primary key,
    grn_id text not null,
    product_id text not null,
    qty real not null,
    unit_cost_cents integer not null,
    batch_no text,
    expiry_date text
  )`,
  `create index if not exists idx_sale_lines_sale on sale_lines (sale_id)`,
  `create index if not exists idx_movements_product on stock_movements (product_id)`,
  `create index if not exists idx_cust_txn_customer on customer_transactions (customer_id)`,
  `create index if not exists idx_outbox_seq on outbox (client_seq)`,
];
