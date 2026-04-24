-- Migration to add invoice financial columns to nodriza_tesoreria
ALTER TABLE nodriza_tesoreria 
ADD COLUMN IF NOT EXISTS invoice_serie TEXT,
ADD COLUMN IF NOT EXISTS invoice_correlativo TEXT,
ADD COLUMN IF NOT EXISTS mismatch_reason TEXT,
ADD COLUMN IF NOT EXISTS invoice_subtotal NUMERIC(15, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS invoice_igv NUMERIC(15, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS invoice_total NUMERIC(15, 2) DEFAULT 0;

-- Ensure the vouchers bucket exists (optional if already handled, but safe)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('vouchers', 'vouchers', true)
ON CONFLICT (id) DO NOTHING;
