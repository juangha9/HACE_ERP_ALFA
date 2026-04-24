export interface Piece {
    id: string;
    description: string;
    code: string;
    width: number;
    height: number;
    quantity: number;
    matchGrain: boolean; // Sentido de veta (bloquear rotación)
    edgeBanding: {
        top: number; // 0: None, 1: Type 1, 2: Type 2
        bottom: number;
        left: number;
        right: number;
    };
    enabled?: boolean;
    comment?: string;
    material?: string;
}

export interface OptimizationConfig {
    sawKerf: number;
    trimming: {
        top: number;
        bottom: number;
        left: number;
        right: number;
    };
    strategy: 'MAX_SAVINGS' | 'SIMPLE_CUTS';
    cutDirection: 'OPTIMAL' | 'HORIZONTAL' | 'VERTICAL';
    boardWidth: number;
    boardHeight: number;
    
    // New technical fields
    grainDirection: 'HORIZONTAL' | 'VERTICAL';
    preFresado: number; // in mm
    material: string;
    
    // Edge Banding configuration
    edgeThickness1: number;
    edgeThickness2: number;
    
    // Documentation
    clientName: string;
    workOrder: string; // Internal / Visual
    labelInfo: string;
}
