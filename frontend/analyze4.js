
const url = 'https://lehebpzmozawdtrlphnw.supabase.co/rest/v1/nodriza_tesoreria?select=*';
const key = 'sb_publishable_pNwzAdgEg2Zqbt_xUta23A_KHvVHLCZ';

async function run() {
    const res = await fetch(url, { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } });
    const data = await res.json();
    
    let balances = {};
    let totalEfectivo = 0;
    
    data.forEach(m => {
        let amt = 0;
        if (m.tipo_movimiento === 'INGRESO' && m.cuenta_destino === 'Efectivo') amt = Number(m.monto);
        if (m.tipo_movimiento === 'EGRESO' && m.cuenta_origen === 'Efectivo') amt = -Number(m.monto);
        if (m.tipo_movimiento === 'TRANSFERENCIA') {
             if (m.cuenta_destino === 'Efectivo') amt = Number(m.monto);
             if (m.cuenta_origen === 'Efectivo') amt = -Number(m.monto);
        }
        
        totalEfectivo += amt;
        
        let ref = m.referencia_id || 'SIN_REFERENCIA';
        if (!balances[ref]) balances[ref] = 0;
        balances[ref] += amt;
    });

    console.log('SALDO TOTAL CAJA:', totalEfectivo);
    console.log('DESGLOSE GLOBAL POR REFERENCIA DE VENTA (ID o "SIN_REFERENCIA"):');
    for (const [ref, bal] of Object.entries(balances)) {
        if (bal !== 0) console.log(`Referencia: ${ref} -> Saldo Restante en Caja: ${bal}`);
    }
}

run();
