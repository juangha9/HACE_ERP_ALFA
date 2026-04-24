
import { createClient } from '@supabase/supabase-js'

export interface Env {
  SUPABASE_URL: string
  SUPABASE_KEY: string
}

// Helper to create Supabase Client
const getSupabase = (env: Env) => {
  return createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
}

// Helper for CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, DELETE, OPTIONS, PATCH, PUT',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {

    // Handle OPTIONS (Preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const supabase = getSupabase(env);

    try {
      // --- ROUTER ---

      // 1. GET /api/projects -> List all projects
      if (request.method === 'GET' && url.pathname === '/api/projects') {
        // Using projects table directly instead of projects_view to ensure retail_board is included
        const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 2. POST /api/projects -> Create new project
      if (request.method === 'POST' && url.pathname === '/api/projects') {
        const body = await request.json();
        const { data, error } = await supabase.from('projects').insert(body).select();
        if (error) throw error;
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 2b. PATCH /api/projects?id=... -> Update project
      if (request.method === 'PATCH' && url.pathname === '/api/projects') {
        const id = url.searchParams.get('id');
        if (!id) throw new Error('Project ID is required');
        const body = await request.json();
        const { data, error } = await supabase.from('projects').update(body).eq('id', id).select();
        if (error) throw error;
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 2c. DELETE /api/projects?id=... -> Delete project
      if (request.method === 'DELETE' && url.pathname === '/api/projects') {
        const id = url.searchParams.get('id');
        if (!id) throw new Error('Project ID is required');

        const { error } = await supabase.from('projects').delete().eq('id', id);
        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 3. GET /api/items?project_id=XYZ -> Get items for a project
      if (request.method === 'GET' && url.pathname === '/api/items') {
        const projectId = url.searchParams.get('project_id');
        if (!projectId) throw new Error('project_id is required');

        const [itemsResp, movsResp] = await Promise.all([
          supabase.from('project_items').select('*').eq('project_id', projectId),
          supabase.from('inventory_movements').select('*, product:catalog_products(base_name)').eq('project_id', projectId)
        ]);

        if (itemsResp.error) throw itemsResp.error;
        if (movsResp.error) throw movsResp.error;

        const items = itemsResp.data || [];
        const movs = (movsResp.data || []).map(m => ({
          id: m.id,
          project_id: m.project_id,
          category: 'MATERIAL',
          description: m.product?.base_name || 'Producto',
          unit: 'UND',
          planned_qty: 0,
          planned_unit_price: 0,
          real_qty: ['OUT_PROJECT_CONSUMPTION', 'OUT_PROJECT', 'OUT_SALE'].includes(m.type) ? m.quantity : -m.quantity,
          real_unit_price: m.unit_cost || 0,
          origin: 'ALMACÉN',
          supplier: 'INTERNO',
          transaction_date: m.date,
          created_at: m.created_at
        }));

        const combined = [...items, ...movs].sort((a, b) => 
          (b.transaction_date || '').localeCompare(a.transaction_date || '')
        );

        return new Response(JSON.stringify(combined), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 4. POST /api/items -> Bulk Upsert items
      if (request.method === 'POST' && url.pathname === '/api/items') {
        const body = await request.json();
        // body can be an object or an array
        const { data, error } = await supabase.from('project_items').upsert(body).select();
        if (error) throw error;
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 5. DELETE /api/items -> Bulk Delete items (expects array of IDs in body)
      if (request.method === 'DELETE' && url.pathname === '/api/items') {
        const body = await request.json(); // { ids: string[] }
        if (!body.ids || !Array.isArray(body.ids)) throw new Error('ids array is required');

        const { data, error } = await supabase.from('project_items').delete().in('id', body.ids);
        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 6. GET /api/collections?project_id=... -> Get collections for a project
      if (request.method === 'GET' && url.pathname === '/api/collections') {
        const projectId = url.searchParams.get('project_id');
        if (!projectId) throw new Error('project_id is required');

        const { data, error } = await supabase
          .from('project_collections')
          .select('*')
          .eq('project_id', projectId)
          .order('date', { ascending: false });

        if (error) throw error;
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 7. POST /api/collections -> Create or update collection
      if (request.method === 'POST' && url.pathname === '/api/collections') {
        const body = await request.json();
        const { data, error } = await supabase.from('project_collections').upsert(body).select();
        if (error) throw error;
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 8. DELETE /api/collections -> Delete a collection
      if (request.method === 'DELETE' && url.pathname === '/api/collections') {
        const id = url.searchParams.get('id');
        if (!id) throw new Error('Collection ID is required');

        const { data, error } = await supabase.from('project_collections').delete().eq('id', id);
        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // --- NEW: COST ZONES (Logistics) ---
      // 8b. GET /api/cost-zones/default -> Get the default (first) zone
      if (request.method === 'GET' && url.pathname === '/api/cost-zones/default') {
        const { data, error } = await supabase
          .from('cost_zones')
          .select('*')
          .limit(1)
          .single();

        if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows returned"

        return new Response(JSON.stringify(data || null), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 8c. POST /api/cost-zones/default -> Create or Update default zone
      if (request.method === 'POST' && url.pathname === '/api/cost-zones/default') {
        const body = await request.json(); // { name, latitude, longitude }
        // Check if a zone exists
        const { data: existing } = await supabase.from('cost_zones').select('id').limit(1).single();

        let result;
        if (existing) {
          // Update
          result = await supabase.from('cost_zones').update({
            name: body.name,
            latitude: body.latitude,
            longitude: body.longitude
          }).eq('id', existing.id).select();
        } else {
          // Insert
          result = await supabase.from('cost_zones').insert({
            name: body.name,
            description: 'Zona Principal',
            latitude: body.latitude,
            longitude: body.longitude
          }).select();
        }

        if (result.error) throw result.error;
        return new Response(JSON.stringify(result.data[0]), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 8d. GET /api/transport-rates/default -> Get rates for default zone
      if (request.method === 'GET' && url.pathname === '/api/transport-rates/default') {
        // Get default zone first
        const { data: zone } = await supabase.from('cost_zones').select('id').limit(1).single();
        if (!zone) {
          return new Response(JSON.stringify({}), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const { data, error } = await supabase
          .from('transport_rates')
          .select('*')
          .eq('zone_id', zone.id)
          .limit(1)
          .single();

        if (error && error.code !== 'PGRST116') throw error;

        return new Response(JSON.stringify(data || {}), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 8e. POST /api/transport-rates/default -> Update rates
      if (request.method === 'POST' && url.pathname === '/api/transport-rates/default') {
        const body = await request.json(); // { vehicle_freight_rate, bands_config }

        // Ensure zone exists
        let { data: zone } = await supabase.from('cost_zones').select('id').limit(1).single();
        if (!zone) {
          // Create one if missing
          const { data: newZone } = await supabase.from('cost_zones').insert({ name: 'Zona Default' }).select().single();
          zone = newZone;
        }

        // Check if rates exist
        const { data: existingRates } = await supabase.from('transport_rates').select('id').eq('zone_id', zone.id).limit(1).single();

        let result;
        if (existingRates) {
          result = await supabase.from('transport_rates').update({
            vehicle_freight_rate: body.vehicle_freight_rate,
            bands_config: body.bands_config
          }).eq('id', existingRates.id).select();
        } else {
          result = await supabase.from('transport_rates').insert({
            zone_id: zone.id,
            vehicle_freight_rate: body.vehicle_freight_rate,
            bands_config: body.bands_config
          }).select();
        }

        if (result.error) throw result.error;
        return new Response(JSON.stringify(result.data[0]), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      // 9. GET /api/stats/historical-utility -> Calculate average margin across all projects
      if (request.method === 'GET' && url.pathname === '/api/stats/historical-utility') {
        // Fetch projects and their items' real costs
        const { data: projects, error: projectsError } = await supabase
          .from('projects')
          .select('id, budget_total, items:project_items(real_qty, real_unit_price)');

        if (projectsError) throw projectsError;

        if (!projects || projects.length === 0) {
          return new Response(JSON.stringify({ averageUtility: 0 }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const utilities = projects.map(p => {
          const budget = p.budget_total || 0;
          if (budget <= 0) return 0;

          const realCost = (p.items as any[] || []).reduce((sum, item) =>
            sum + ((item.real_qty || 0) * (item.real_unit_price || 0)), 0);

          return ((budget - realCost) / budget) * 100;
        });

        const avgUtility = utilities.reduce((a, b) => a + b, 0) / utilities.length;

        return new Response(JSON.stringify({ averageUtility: avgUtility }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 10. GET /api/management-parameters -> Get first row
      if (request.method === 'GET' && url.pathname === '/api/management-parameters') {
        const { data, error } = await supabase.from('management_parameters').select('*').limit(1).single();
        if (error && error.code !== 'PGRST116') throw error;
        return new Response(JSON.stringify(data || {}), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 11. POST /api/management-parameters -> Upsert
      if (request.method === 'POST' && url.pathname === '/api/management-parameters') {
        const body = await request.json();
        const { data: existing } = await supabase.from('management_parameters').select('id').limit(1).single();

        let result;
        if (existing) {
          result = await supabase.from('management_parameters').update(body).eq('id', existing.id).select();
        } else {
          result = await supabase.from('management_parameters').insert(body).select();
        }
        if (result.error) throw result.error;
        return new Response(JSON.stringify(result.data[0]), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 12. GET /api/supply-kits -> List all active kits
      if (request.method === 'GET' && url.pathname === '/api/supply-kits') {
        const { data, error } = await supabase.from('supply_kits').select('*').order('created_at');
        if (error) throw error;
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 13. POST /api/supply-kits -> Create/Update Kit
      if (request.method === 'POST' && url.pathname === '/api/supply-kits') {
        const body = await request.json();
        console.log('[Backend] POST /api/supply-kits payload:', JSON.stringify(body, null, 2));

        // Body should include id (optional), name, description, items (jsonb)
        const { id, ...updates } = body;

        let result;
        if (id) {
          console.log(`[Backend] Updating kit ${id}`);
          result = await supabase.from('supply_kits').update(updates).eq('id', id).select();
        } else {
          console.log('[Backend] Creating new kit');
          result = await supabase.from('supply_kits').insert(updates).select();
        }

        if (result.error) {
          console.error('[Backend] DB Error supply-kits:', result.error);
          throw result.error;
        }
        return new Response(JSON.stringify(result.data[0]), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 13b. DELETE /api/supply-kits
      if (request.method === 'DELETE' && url.pathname === '/api/supply-kits') {
        const id = url.searchParams.get('id');
        if (!id) throw new Error('ID required');
        const { error } = await supabase.from('supply_kits').delete().eq('id', id);
        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 14. GET /api/machinery-wear -> List machinery & consumables
      if (request.method === 'GET' && url.pathname === '/api/machinery-wear') {
        const { data, error } = await supabase.from('machinery_wear').select('*').order('created_at');
        if (error) throw error;
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 15. POST /api/machinery-wear -> Bulk Upsert (simplified)
      if (request.method === 'POST' && url.pathname === '/api/machinery-wear') {
        const body = await request.json(); // Expect array or single object
        console.log('[Backend] POST /api/machinery-wear payload:', JSON.stringify(body, null, 2));

        const { data, error } = await supabase.from('machinery_wear').upsert(body).select();

        if (error) {
          console.error('[Backend] DB Error machinery-wear:', error);
          throw error;
        }
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 15b. DELETE /api/machinery-wear
      if (request.method === 'DELETE' && url.pathname === '/api/machinery-wear') {
        const id = url.searchParams.get('id');
        if (!id) throw new Error('ID required');
        const { error } = await supabase.from('machinery_wear').delete().eq('id', id);
        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 16. GET /api/optimizations
      if (request.method === 'GET' && url.pathname === '/api/optimizations') {
        const [optsRes, projectsRes] = await Promise.all([
          supabase.from('optimizations').select('*, projects!project_id(name)').order('created_at', { ascending: false }),
          supabase.from('projects').select('*').not('retail_board', 'is', null).order('created_at', { ascending: false })
        ]);

        if (optsRes.error) throw new Error(`Error fetching optimizations: ${optsRes.error.message}`);
        if (projectsRes.error) throw new Error(`Error fetching projects: ${projectsRes.error.message}`);

        // Map projects with retail_board to the same structure as optimizations
        const mappedProjects = (projectsRes.data || []).map(p => ({
          id: p.id,
          code: p.project_number,
          origin_type: 'VENTA_DIRECTA' as const,
          project_id: null,
          status: 'LISTO_CORTE' as const,
          data: p.retail_board,
          created_at: p.created_at,
          updated_at: p.created_at,
          projects: { name: p.name }
        }));

        const combined = [...(optsRes.data || []), ...mappedProjects].sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        return new Response(JSON.stringify(combined), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 17. POST /api/optimizations
      if (request.method === 'POST' && url.pathname === '/api/optimizations') {
        const body = await request.json();
        const { id, ...updates } = body;

        let result;

        if (id) {
          // Explicit update by ID
          result = await supabase.from('optimizations').update(updates).eq('id', id).select();
        } else {
          // New insert path — need to handle code carefully
          
          // If frontend sent a code, check if it already exists
          if (updates.code) {
            const { data: existing } = await supabase
              .from('optimizations')
              .select('id')
              .eq('code', updates.code)
              .limit(1);
            
            if (existing && existing.length > 0) {
              // Code already exists — update the existing record instead of inserting
              result = await supabase
                .from('optimizations')
                .update(updates)
                .eq('id', existing[0].id)
                .select();
              
              if (!result.error) {
                return new Response(JSON.stringify(result.data[0]), { 
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
                });
              }
            }
          }
          
          // Auto-generate a fresh unique code if none provided or if we need a new one
          if (!updates.code) {
            const { data: lastOpts } = await supabase
              .from('optimizations')
              .select('code')
              .like('code', 'OPT-%')
              .order('created_at', { ascending: false })
              .limit(20);
            
            let maxNum = 0;
            if (lastOpts && lastOpts.length > 0) {
              lastOpts.forEach(opt => {
                const m = opt.code.match(/OPT-(\d+)/);
                if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
              });
            }
            updates.code = `OPT-${String(maxNum + 1).padStart(6, '0')}-V1`;
          }

          // Attempt insert with retry on conflict
          result = await supabase.from('optimizations').insert(updates).select();
          
          if (result.error && result.error.message?.includes('duplicate key')) {
            // Race condition fallback: generate a timestamp-based unique code
            const ts = Date.now().toString(36).toUpperCase();
            updates.code = `OPT-${ts}-V1`;
            result = await supabase.from('optimizations').insert(updates).select();
          }
        }
        
        if (result.error) throw result.error;
        return new Response(JSON.stringify(result.data[0]), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 18. DELETE /api/optimizations
      if (request.method === 'DELETE' && url.pathname === '/api/optimizations') {
        const id = url.searchParams.get('id');
        if (!id) throw new Error('ID required');
        const { error } = await supabase.from('optimizations').delete().eq('id', id);
        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 19. GET /api/material-requests
      if (request.method === 'GET' && url.pathname === '/api/material-requests') {
        const { data, error } = await supabase.from('material_requests').select('*, catalog_products(name, sku, min_stock), projects(name)').order('created_at', { ascending: false });
        if (error) throw error;
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 20. POST /api/material-requests
      if (request.method === 'POST' && url.pathname === '/api/material-requests') {
        const body = await request.json(); // array or single item
        const { data, error } = await supabase.from('material_requests').upsert(body).select();
        if (error) throw error;
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 21. GET /api/roles
      if (request.method === 'GET' && url.pathname === '/api/roles') {
        const { data, error } = await supabase
          .from('roles')
          .select('*, detalles_rol(*)')
          .order('created_at', { ascending: true });
        if (error) throw error;
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 22. POST /api/roles (Upsert Role and its Details)
      if (request.method === 'POST' && url.pathname === '/api/roles') {
        try {
          const body = await request.json();
          // Extract known columns to prevent DB errors from extra fields
          const { id, detalles_rol } = body;
          const allowedFields = ['nombre_cargo', 'area', 'reporta_a', 'supervisa_a', 'proposito', 'nombres', 'horario', 'rango_salarial', 'sueldo', 'dotacion', 'parent_id', 'dni', 'jerarquia'];
          
          const roleData: any = {};
          allowedFields.forEach(field => {
            if (body[field] !== undefined) {
              roleData[field] = body[field];
            }
          });

          // Validation: nombre_cargo is required only for new roles
          if (!id && !roleData.nombre_cargo) throw new Error("Nombre del cargo es requerido");

          let roleId;
          if (id) {
            const { error: updateError } = await supabase.from('roles').update(roleData).eq('id', id);
            if (updateError) throw updateError;
            roleId = id;
          } else {
            const { data: inserted, error: insertError } = await supabase.from('roles').insert(roleData).select().single();
            if (insertError) throw insertError;
            roleId = inserted.id;
          }

          // Handle details
          if (detalles_rol && Array.isArray(detalles_rol)) {
            await supabase.from('detalles_rol').delete().eq('rol_id', roleId);
            if (detalles_rol.length > 0) {
              const detailsToInsert = detalles_rol.map((d: any) => ({
                rol_id: roleId,
                categoria: d.categoria,
                descripcion: d.descripcion,
                orden: d.orden || 0
              }));
              const { error: dError } = await supabase.from('detalles_rol').insert(detailsToInsert);
              if (dError) throw dError;
            }
          }

          const { data: finalRole, error: finalError } = await supabase
            .from('roles')
            .select('*, detalles_rol(*)')
            .eq('id', roleId)
            .single();
          if (finalError) throw finalError;

          return new Response(JSON.stringify(finalRole), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } catch (error: any) {
          return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      // 23. DELETE /api/roles
      if (request.method === 'DELETE' && url.pathname === '/api/roles') {
        const id = url.searchParams.get('id');
        if (!id) throw new Error('ID required');
        const { error } = await supabase.from('roles').delete().eq('id', id);
        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 404 Route Not Found
      return new Response('Not Found', { status: 404, headers: corsHeaders });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  },
};
