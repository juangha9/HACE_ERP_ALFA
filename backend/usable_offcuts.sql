-- Script to create the usable_offcuts table for tracking reusable board offcuts.

CREATE TABLE IF NOT EXISTS public.usable_offcuts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    material_type TEXT NOT NULL DEFAULT 'Melamina Blanca 18mm',
    width DECIMAL(10, 2) NOT NULL,
    height DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    is_used BOOLEAN DEFAULT false,
    notes TEXT
);

COMMENT ON TABLE public.usable_offcuts IS 'Stores offcuts (sobrantes) generated from optimizations that are large enough to be reused.';

-- Si deseas implementar políticas RLS (Row Level Security):
ALTER TABLE public.usable_offcuts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all users to select offcuts" ON public.usable_offcuts
    FOR SELECT USING (true);

CREATE POLICY "Allow all users to insert offcuts" ON public.usable_offcuts
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow all users to update offcuts" ON public.usable_offcuts
    FOR UPDATE USING (true);
