-- Migration to add invoice_status to nodriza_tesoreria
-- Default is 'REGISTRADO' as requested by the user.
-- This ensures existing records and future records start as 'REGISTRADO'.

ALTER TABLE nodriza_tesoreria ADD COLUMN IF NOT EXISTS invoice_status TEXT DEFAULT 'REGISTRADO';

-- Ensure all existing records have the status
UPDATE nodriza_tesoreria SET invoice_status = 'REGISTRADO' WHERE invoice_status IS NULL;
