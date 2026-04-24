const url = 'https://lehebpzmozawdtrlphnw.supabase.co/rest/v1/nodriza_tesoreria?select=*';
const key = 'sb_publishable_pNwzAdgEg2Zqbt_xUta23A_KHvVHLCZ';

async function run() {
    const res = await fetch(url, { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } });
    const data = await res.json();
    
    console.log("MOVIMIENTOS SIN ASOCIAR A VENTAS (Efectivo):");
    let total = 0;
    data.forEach(m => {
        let amt = 0;
        if (m.tipo_movimiento === 'INGRESO' && m.cuenta_destino === 'Efectivo') amt = Number(m.monto);
        if (m.tipo_movimiento === 'EGRESO' && m.cuenta_origen === 'Efectivo') amt = -Number(m.monto);
        if (m.tipo_movimiento === 'TRANSFERENCIA') {
             if (m.cuenta_destino === 'Efectivo') amt = Number(m.monto);
             if (m.cuenta_origen === 'Efectivo') amt = -Number(m.monto);
        }
        
        if (!m.referencia_id && amt !== 0) {
            total += amt;
            console.log(`- S/ ${amt} | ${m.tipo_movimiento} | ${m.observaciones}`);
        }
    });
    console.log("TOTAL GENERICO SIN CONTAR VENTAS:", total);
}

run();
