import { supabase } from './supabase';

export interface ProductCategory {
    id: string;
    name: string;
    code: string;
}

export interface ProductFamily {
    id: string;
    category_id: string;
    name: string;
    code: string;
}

export interface ProductSubfamily {
    id: string;
    family_id: string;
    name: string;
    code: string;
}

export interface CatalogProduct {
    id: string;
    sku: string;
    subfamily_id: string;
    base_name: string;
    presentation: string;
    brand?: string;
    features?: string;
    min_stock: number;
    stock_alerts: boolean;
    status: 'Activo' | 'Descontinuado' | 'Inactivo';
    unit?: string;

    // Joins
    product_subfamilies?: {
        name: string;
        product_families?: {
            name: string;
            product_categories?: {
                name: string;
            }
        }
    };
}

export const catalogService = {
    // --- Categorías ---
    async getCategories() {
        const { data, error } = await supabase
            .from('product_categories')
            .select('*')
            .order('name');
        if (error) throw error;
        return data as ProductCategory[];
    },

    async createCategory(category: { name: string, code: string }) {
        const { data, error } = await supabase
            .from('product_categories')
            .insert([category])
            .select()
            .single();
        if (error) throw error;
        return data as ProductCategory;
    },

    async checkCategoryCodeExists(code: string) {
        const { data, error } = await supabase
            .from('product_categories')
            .select('id')
            .eq('code', code.toUpperCase())
            .limit(1)
            .maybeSingle();
        if (error) throw error;
        return !!data;
    },

    // --- Familias ---
    async getFamilies(categoryId?: string) {
        let query = supabase.from('product_families').select('*').order('name');
        if (categoryId) {
            query = query.eq('category_id', categoryId);
        }
        const { data, error } = await query;
        if (error) throw error;
        return data as ProductFamily[];
    },

    async createFamily(family: { category_id: string, name: string, code: string }) {
        const { data, error } = await supabase
            .from('product_families')
            .insert([family])
            .select()
            .single();
        if (error) throw error;
        return data as ProductFamily;
    },

    async checkFamilyCodeExists(categoryId: string, code: string) {
        const { data, error } = await supabase
            .from('product_families')
            .select('id')
            .eq('category_id', categoryId)
            .eq('code', code.toUpperCase())
            .limit(1)
            .maybeSingle();
        if (error) throw error;
        return !!data;
    },

    // --- Subfamilias ---
    async getSubfamilies(familyId?: string) {
        let query = supabase.from('product_subfamilies').select('*').order('name');
        if (familyId) {
            query = query.eq('family_id', familyId);
        }
        const { data, error } = await query;
        if (error) throw error;
        return data as ProductSubfamily[];
    },

    async createSubfamily(subfamily: { family_id: string, name: string, code: string }) {
        const { data, error } = await supabase
            .from('product_subfamilies')
            .insert([subfamily])
            .select()
            .single();
        if (error) throw error;
        return data as ProductSubfamily;
    },

    async checkSubfamilyCodeExists(familyId: string, code: string) {
        const { data, error } = await supabase
            .from('product_subfamilies')
            .select('id')
            .eq('family_id', familyId)
            .eq('code', code.toUpperCase())
            .limit(1)
            .maybeSingle();
        if (error) throw error;
        return !!data;
    },

    // --- Productos ---
    async getProducts() {
        const { data, error } = await supabase
            .from('catalog_products')
            .select(`
        *,
        product_subfamilies (
          name,
          product_families (
            name,
            product_categories (
              name
            )
          )
        )
      `)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data as CatalogProduct[];
    },

    async createProduct(product: Omit<CatalogProduct, 'id' | 'sku'>) {
        // El SKU se autogenerará por el trigger de Supabase.
        const { data, error } = await supabase
            .from('catalog_products')
            .insert([product])
            .select()
            .single();
        if (error) throw error;
        return data as CatalogProduct;
    },

    async bulkCreateProducts(products: Omit<CatalogProduct, 'id' | 'sku'>[]) {
        // Se insertan varios registros a la vez
        const { data, error } = await supabase
            .from('catalog_products')
            .insert(products)
            .select();
        if (error) throw error;
        return data as CatalogProduct[];
    },

    async updateProduct(id: string, updates: Partial<CatalogProduct>, editReason?: string) {
        // En un caso real podrías envolver esto en una RPC para que sea una transacción atómica.
        const { data, error } = await supabase
            .from('catalog_products')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;

        // Log editing reason if provided
        if (editReason) {
            const { error: logError } = await supabase
                .from('product_edit_logs')
                .insert([{ product_id: id, reason: editReason }]);
            if (logError) console.error('Failed to log edit reason:', logError);
        }

        return data as CatalogProduct;
    }
};
