export interface ProductMerma {
    id: string;
    product_id: string;
    quantity: number;
    reason: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    created_at?: string;
    approved_at?: string;
    approved_by?: string;

    // Join
    product?: any; // To hold the related InventoryProduct data
}
