import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { API_URL } from '../../services/apiConfig';

// Fix for default marker icon in React Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Component to handle map clicks for Plant placement only
function LocationMarker({ onLocationSelect }: { onLocationSelect: (pos: [number, number]) => void }) {
    useMapEvents({
        click(e) {
            onLocationSelect([e.latlng.lat, e.latlng.lng]);
        },
    });
    return null;
}

// Component to fly to searched location
function MapFlyTo({ center }: { center: [number, number] }) {
    const map = useMap();
    map.flyTo(center, 13);
    return null;
}

export function LogisticsCard() {
    // Initial State
    const [zoneName, setZoneName] = useState(() => localStorage.getItem('siderPer_logistics_zoneName') || 'Lima Metropolitana');
    const [freightRate, setFreightRate] = useState(() => parseFloat(localStorage.getItem('siderPer_logistics_freightRate') || '150.00'));
    const [isSearching, setIsSearching] = useState(false);

    // Map State
    const [plantPosition, setPlantPosition] = useState<[number, number]>(() => {
        const saved = localStorage.getItem('siderPer_logistics_plantPosition');
        return saved ? JSON.parse(saved) : [-12.0464, -77.0428];
    });
    const [mapCenter, setMapCenter] = useState<[number, number]>(() => {
        const saved = localStorage.getItem('siderPer_logistics_plantPosition');
        return saved ? JSON.parse(saved) : [-12.0464, -77.0428];
    });

    const [isEditingPlant, setIsEditingPlant] = useState(false);

    const [transportBands, setTransportBands] = useState(() => {
        const saved = localStorage.getItem('siderPer_logistics_transportBands');
        return saved ? JSON.parse(saved) : [
            { id: 1, range: '0-5', price: 25.00, color: 'bg-indigo-50 text-indigo-700', ringColor: '#818cf8', radius: 5000 },
            { id: 2, range: '5-15', price: 45.00, color: 'bg-indigo-50 text-indigo-700', ringColor: '#6366f1', radius: 15000 },
            { id: 3, range: '15-30', price: 70.00, color: 'bg-indigo-50 text-indigo-700', ringColor: '#4f46e5', radius: 30000 },
            { id: 4, range: '+30', price: 110.00, color: 'bg-indigo-50 text-indigo-700', ringColor: '#4338ca', radius: 45000 },
        ];
    });

    const [isEditingBands, setIsEditingBands] = useState(false);

    // 1. Backend Sync on Mount
    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch Zone
                const zoneRes = await fetch(`${API_URL}/cost-zones/default`);
                if (zoneRes.ok) {
                    const zoneData = await zoneRes.json();
                    if (zoneData) {
                        if (zoneData.name) {
                            setZoneName(zoneData.name);
                            localStorage.setItem('siderPer_logistics_zoneName', zoneData.name);
                        }
                        if (zoneData.latitude && zoneData.longitude) {
                            const pos: [number, number] = [parseFloat(zoneData.latitude), parseFloat(zoneData.longitude)];
                            setPlantPosition(pos);
                            setMapCenter(pos);
                            localStorage.setItem('siderPer_logistics_plantPosition', JSON.stringify(pos));
                        }
                    }
                }

                // Fetch Rates
                const ratesRes = await fetch(`${API_URL}/transport-rates/default`);
                if (ratesRes.ok) {
                    const ratesData = await ratesRes.json();
                    if (ratesData) {
                        if (ratesData.vehicle_freight_rate !== undefined) {
                            setFreightRate(Number(ratesData.vehicle_freight_rate));
                            localStorage.setItem('siderPer_logistics_freightRate', ratesData.vehicle_freight_rate.toString());
                        }
                        if (ratesData.bands_config) {
                            const bands = typeof ratesData.bands_config === 'string'
                                ? JSON.parse(ratesData.bands_config)
                                : ratesData.bands_config;

                            if (Array.isArray(bands)) {
                                setTransportBands(bands);
                                localStorage.setItem('siderPer_logistics_transportBands', JSON.stringify(bands));
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to fetch logistics data", err);
            }
        };
        fetchData();
    }, []);

    // 2. Persistence Effects (Client-side backup)
    useEffect(() => { localStorage.setItem('siderPer_logistics_zoneName', zoneName); }, [zoneName]);
    useEffect(() => { localStorage.setItem('siderPer_logistics_freightRate', freightRate.toString()); }, [freightRate]);
    useEffect(() => { localStorage.setItem('siderPer_logistics_plantPosition', JSON.stringify(plantPosition)); }, [plantPosition]);
    useEffect(() => { localStorage.setItem('siderPer_logistics_transportBands', JSON.stringify(transportBands)); }, [transportBands]);

    // 3. Backend Save Functions
    const saveZoneToBackend = async (name: string, pos: [number, number]) => {
        try {
            await fetch(`${API_URL}/cost-zones/default`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    latitude: pos[0],
                    longitude: pos[1]
                })
            });
        } catch (err) {
            console.error("Failed to save zone", err);
        }
    };

    const saveRatesToBackend = async (freight: number, bands: any[]) => {
        try {
            await fetch(`${API_URL}/transport-rates/default`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vehicle_freight_rate: freight,
                    bands_config: bands
                })
            });
        } catch (err) {
            console.error("Failed to save rates", err);
        }
    };

    // 4. Handlers
    const handleMapClick = (pos: [number, number]) => {
        if (isEditingPlant) {
            setPlantPosition(pos);
            setMapCenter(pos);
            saveZoneToBackend(zoneName, pos);
        }
    };

    const searchZone = async () => {
        if (!zoneName) return;
        setIsSearching(true);
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(zoneName)}`);
            const data = await response.json();
            if (data && data.length > 0) {
                const { lat, lon } = data[0];
                const newPos: [number, number] = [parseFloat(lat), parseFloat(lon)];
                setPlantPosition(newPos);
                setMapCenter(newPos);
                saveZoneToBackend(zoneName, newPos);
            } else {
                alert('Ubicación no encontrada');
            }
        } catch (error) {
            console.error('Error searching location:', error);
            alert('Error al buscar la ubicación');
        } finally {
            setIsSearching(false);
        }
    };

    const getBandRadius = (rangeStr: string, defaultRadius: number) => {
        try {
            if (!rangeStr) return defaultRadius;
            const parts = rangeStr.split('-');
            if (parts.length === 2) {
                const max = parseInt(parts[1]);
                if (isNaN(max)) return defaultRadius;
                return max * 1000;
            }
            if (rangeStr.startsWith('+')) return defaultRadius;
            return defaultRadius;
        } catch (e) {
            return defaultRadius;
        }
    };

    const updateBand = (id: number, field: 'range' | 'price', value: string | number) => {
        setTransportBands((bands: any[]) => bands.map(b => b.id === id ? { ...b, [field]: value } : b));
    };

    return (
        <>
            {/* WIDGET 1: LOGISTICS CONTROLS */}
            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 space-y-8 h-full flex flex-col justify-center">
                <div className="flex items-center gap-4 text-indigo-600 mb-2">
                    <span className="material-symbols-outlined text-3xl bg-indigo-50 p-3 rounded-2xl">local_shipping</span>
                    <div>
                        <h3 className="text-xl font-black tracking-tight uppercase italic">Logística y Fletes</h3>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Configuración de Rutas</p>
                    </div>
                </div>

                <div className="space-y-8">
                    {/* Zone Name */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1 block">Lugar de Planta Operativa</label>
                        <div className="flex gap-3">
                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    value={zoneName}
                                    onChange={(e) => setZoneName(e.target.value)}
                                    onBlur={() => saveZoneToBackend(zoneName, plantPosition)}
                                    onKeyDown={(e) => e.key === 'Enter' && searchZone()}
                                    placeholder="Ej: Arequipa, Trujillo..."
                                    className="w-full bg-slate-50 border-slate-200 rounded-2xl pl-6 pr-14 py-4 text-xl font-black text-slate-700 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
                                />
                                <button
                                    onClick={searchZone}
                                    disabled={isSearching}
                                    className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors disabled:opacity-50"
                                >
                                    <span className="material-symbols-outlined text-2xl">{isSearching ? 'hourglass_empty' : 'search'}</span>
                                </button>
                            </div>
                            <button
                                onClick={() => setIsEditingPlant(!isEditingPlant)}
                                className={`px-5 rounded-2xl flex items-center justify-center transition-all ${isEditingPlant ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200 scale-105' : 'bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-indigo-600'}`}
                                title="Mover punto de origen en el mapa"
                            >
                                <span className="material-symbols-outlined text-2xl">{isEditingPlant ? 'location_on' : 'edit_location_alt'}</span>
                            </button>
                        </div>
                        {isEditingPlant && (
                            <p className="text-sm text-indigo-600 font-bold animate-pulse text-center pt-1">Haz clic en el mapa para mover la Planta</p>
                        )}
                    </div>

                    {/* Freight Rate */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1 block">Tarifa Flete Vehículo</label>
                        <div className="relative">
                            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xl">S/</span>
                            <input
                                type="number"
                                value={freightRate}
                                onChange={(e) => setFreightRate(parseFloat(e.target.value))}
                                onBlur={() => saveRatesToBackend(freightRate, transportBands)}
                                className="w-full bg-slate-50 border-slate-200 rounded-2xl pl-16 pr-6 py-4 text-2xl font-black text-slate-700 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
                            />
                        </div>
                    </div>

                    {/* Bands */}
                    <div className="pt-2 space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Anillos de Distancia</label>
                            <button
                                onClick={() => setIsEditingBands(!isEditingBands)}
                                className={`flex items-center gap-1 transition-colors ${isEditingBands ? 'text-indigo-600' : 'text-slate-400 hover:text-indigo-600'}`}
                            >
                                <span className="material-symbols-outlined text-sm">{isEditingBands ? 'check_circle' : 'edit'}</span>
                                <span className="text-[10px] font-black uppercase tracking-wide">{isEditingBands ? 'Finalizar' : 'Editar'}</span>
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            {transportBands.map((band: any) => (
                                <div key={band.id} className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${isEditingBands ? 'border-indigo-100 bg-indigo-50/30' : 'border-slate-100 bg-slate-50'}`}>
                                    {isEditingBands ? (
                                        <>
                                            <input
                                                type="text"
                                                value={band.range}
                                                onChange={(e) => updateBand(band.id, 'range', e.target.value)}
                                                onBlur={() => saveRatesToBackend(freightRate, transportBands)}
                                                className="w-full text-center text-[10px] font-black text-slate-500 bg-transparent border-none p-0 mb-1 focus:ring-0"
                                            />
                                            <div className="flex items-center justify-center gap-0.5">
                                                <span className="text-[10px] font-bold text-indigo-400">S/</span>
                                                <input
                                                    type="number"
                                                    value={band.price}
                                                    onChange={(e) => updateBand(band.id, 'price', parseFloat(e.target.value))}
                                                    onBlur={() => saveRatesToBackend(freightRate, transportBands)}
                                                    className="w-12 text-center font-black text-indigo-600 bg-transparent border-b border-indigo-200 focus:border-indigo-500 p-0 text-sm focus:ring-0"
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{band.range} KM</span>
                                            <span className="font-black text-indigo-600 text-lg">S/ {band.price.toFixed(2)}</span>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* WIDGET 2: MAP */}
            <div className="aspect-square bg-slate-200 rounded-[2rem] overflow-hidden shadow-xl shadow-slate-200/40 border border-slate-100 relative group">
                <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                    <TileLayer
                        attribution=""
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {transportBands.slice(0, 3).map((band: any, index: number) => {
                        const radius = getBandRadius(band.range, band.radius);
                        return (
                            <Circle
                                key={band.id}
                                center={plantPosition}
                                pathOptions={{ color: band.ringColor, fillColor: band.ringColor, fillOpacity: 0.05 + (index * 0.02) }}
                                radius={radius}
                            />
                        );
                    })}

                    <Marker position={plantPosition}>
                        <Popup>
                            <div className="text-center">
                                <p className="font-bold text-slate-800">Planta</p>
                            </div>
                        </Popup>
                    </Marker>

                    <LocationMarker
                        onLocationSelect={handleMapClick}
                    />
                    <MapFlyTo center={mapCenter} />
                </MapContainer>

                <div className="absolute top-4 right-4 flex flex-col items-end gap-2 z-[1000]">
                    {isEditingPlant ? (
                        <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-white/50 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full animate-pulse bg-indigo-500"></div>
                            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
                                MODO EDICIÓN
                            </span>
                        </div>
                    ) : (
                        <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-white/50 flex items-center gap-2">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                VISTA ACTUAL
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
