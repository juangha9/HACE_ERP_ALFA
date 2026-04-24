
const url = 'https://lehebpzmozawdtrlphnw.supabase.co/rest/v1/nodriza_tesoreria?select=*';
const key = 'sb_publishable_pNwzAdgEg2Zqbt_xUta23A_KHvVHLCZ';

async function run() {
    const res = await fetch(url, { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } });
    const data = await res.json();
    
    let totalEfectivoIn = 0;
    let totalEfectivoOut = 0;
    let transferEfectivoIn = 0;
    let transferEfectivoOut = 0;
    
    data.forEach(m => {
        if (m.tipo_movimiento === 'INGRESO' && m.cuenta_destino === 'Efectivo') totalEfectivoIn += Number(m.monto);
        if (m.tipo_movimiento === 'EGRESO' && m.cuenta_origen === 'Efectivo') totalEfectivoOut += Number(m.monto);
        if (m.tipo_movimiento === 'TRANSFERENCIA') {
             if (m.cuenta_destino === 'Efectivo') transferEfectivoIn += Number(m.monto);
             if (m.cuenta_origen === 'Efectivo') transferEfectivoOut += Number(m.monto);
        }
    });

    console.log('--- RESUMEN EFECTIVO ---');
    console.log('Ingresos directos:', totalEfectivoIn);
    console.log('Transferencias hacia Efectivo:', transferEfectivoIn);
    console.log('SUMA TOTAL ENTRADAS:', totalEfectivoIn + transferEfectivoIn);
    console.log('------------------------');
    console.log('Egresos directos (-):', totalEfectivoOut);
    console.log('Transferencias desde Efectivo (-):', transferEfectivoOut);
    console.log('SUMA TOTAL SALIDAS:', totalEfectivoOut + transferEfectivoOut);
    console.log('------------------------');
    const result = totalEfectivoIn - totalEfectivoOut + transferEfectivoIn - transferEfectivoOut;
    console.log('SALDO TOTAL EFECTIVO DISPONIBLE:', result);
    
    console.log('\n--- EGRESOS REGISTRADOS DESDE EFECTIVO ---');
    data.filter(m => m.tipo_movimiento === 'EGRESO' && m.cuenta_origen === 'Efectivo').forEach(m => {
        console.log(`- S/ ${m.monto} | Categoria: ${m.categoria} | Desc: ${m.observaciones}`);
    });
}

run();
