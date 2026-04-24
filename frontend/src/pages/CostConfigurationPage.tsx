import { useNavigate } from 'react-router-dom';
import { LogisticsCard } from '../components/costs/LogisticsCard';
import { SupplyKitsCard } from '../components/costs/SupplyKitsCard';
import { MachineryWearCard } from '../components/costs/MachineryWearCard';
import { ManagementParamsCard } from '../components/costs/ManagementParamsCard';


export default function CostConfigurationPage() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-slate-50/50 p-6 md:p-12">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/settings')}
                        className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                </div>
            </div>

            {/* Modules Grid - Dashboard Style */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* 1. Logistics Modules (Injects 2 Widgets: Controls & Map) */}
                <LogisticsCard />

                {/* 3. Automatic Supply Kits */}
                <div className="md:col-span-2">
                    <SupplyKitsCard />
                </div>

                {/* 4. Financial & Management */}
                <ManagementParamsCard />

                {/* 5. Machinery */}
                <MachineryWearCard />
            </div>
        </div>
    );
}
