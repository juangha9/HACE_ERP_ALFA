import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface StepLocationProps {
    formData: any;
    onChange: (field: string, value: any) => void;
    onNext: () => void;
    onPrev: () => void;
    logisticsConfig?: {
        planta: { lat: number, lng: number };
        rings: any[];
    };
}

// Map Component to handle programmatic panning
function MapController({ center }: { center: L.LatLngExpression }) {
    const map = useMap();
    useEffect(() => {
        map.flyTo(center, 14);
    }, [center, map]);
    return null;
}

function LocationMarker({ position, setPosition }: { position: L.LatLng | null, setPosition: (pos: L.LatLng) => void }) {
    const markerRef = useRef<L.Marker>(null)
    useMapEvents({
        click(e) {
            setPosition(e.latlng)
        },
    })

    return position === null ? null : (
        <Marker
            position={position}
            draggable={true}
            eventHandlers={{
                dragend: (e) => {
                    const marker = e.target;
                    if (marker != null) {
                        setPosition(marker.getLatLng())
                    }
                },
            }}
            ref={markerRef}
        >
            <Popup>Ubicación del Proyecto</Popup>
        </Marker>
    )
}

export function StepLocation({ formData, onChange, onNext, onPrev, logisticsConfig }: StepLocationProps) {
    const [loading, setLoading] = useState(false);
    const [plantaLocation, setPlantaLocation] = useState(logisticsConfig?.planta || { lat: -16.4090, lng: -71.5375 });
    const [rings, setRings] = useState<any[]>(logisticsConfig?.rings || []);

    const [position, setPosition] = useState<L.LatLng | null>(null);
    const [address, setAddress] = useState(formData.location?.address || '');
    const [distance, setDistance] = useState(formData.location?.distance || 0);
    const [isGeocoding, setIsGeocoding] = useState(false);

    useEffect(() => {
        if (logisticsConfig) {
            setPlantaLocation(logisticsConfig.planta);
            const validRings = (logisticsConfig.rings || []).filter(r => !r.range.includes('+') && !r.range.includes('>'));
            setRings(validRings);
        }
    }, [logisticsConfig]);

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

    useEffect(() => {
        if (formData.location) {
            setPosition(new L.LatLng(formData.location.lat, formData.location.lng));
        } else {
            setPosition(new L.LatLng(plantaLocation.lat, plantaLocation.lng));
        }
    }, [formData.location, plantaLocation]);


    const deg2rad = (deg: number) => {
        return deg * (Math.PI / 180);
    };

    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371;
        const dLat = deg2rad(lat2 - lat1);
        const dLon = deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c;
        return parseFloat(d.toFixed(2));
    };

    const handleAddressSearch = async () => {
        if (!address.trim()) return;
        setIsGeocoding(true);
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
            const data = await response.json();
            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);
                const newPos = new L.LatLng(lat, lon);
                setPosition(newPos);

                // Recalculate distance
                const dist = calculateDistance(plantaLocation.lat, plantaLocation.lng, lat, lon);
                setDistance(dist);

                onChange('location', { lat, lng: lon, address: data[0].display_name || address, distance: dist });
            } else {
                alert('No se encontró la dirección.');
            }
        } catch (e) {
            console.error('Geocoding error:', e);
            alert('Error al buscar la dirección.');
        } finally {
            setIsGeocoding(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddressSearch();
        }
    };

    const handlePositionChange = async (latlng: L.LatLng) => {
        setPosition(latlng);

        const dist = calculateDistance(plantaLocation.lat, plantaLocation.lng, latlng.lat, latlng.lng);
        setDistance(dist);

        // Optimistic update
        onChange('location', { lat: latlng.lat, lng: latlng.lng, address: address || `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`, distance: dist });

        // Reverse Geocoding
        setIsGeocoding(true);
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}`);
            const data = await response.json();
            if (data && data.display_name) {
                setAddress(data.display_name);
                onChange('location', { lat: latlng.lat, lng: latlng.lng, address: data.display_name, distance: dist });
            }
        } catch (e) {
            console.error("Reverse geocoding failed", e);
        } finally {
            setIsGeocoding(false);
        }
    };

    if (loading) return <div className="p-8 text-center">Cargando configuración de mapa...</div>;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
            <div className="text-center mb-8">
                <div className="size-16 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
                    <span className="material-symbols-outlined">location_on</span>
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Ubicación del Proyecto</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-2">Selecciona la ubicación exacta para calcular fletes y logística.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Dirección</label>
                        <div className="relative">
                            <textarea
                                className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all h-32 resize-none pr-10 dark:text-white"
                                placeholder="Ingrese dirección y presione enter..."
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                onKeyDown={handleKeyDown}
                            ></textarea>
                            <button
                                onClick={handleAddressSearch}
                                disabled={isGeocoding}
                                className="absolute bottom-3 right-3 size-8 bg-slate-100 dark:bg-slate-700 hover:bg-primary hover:text-white rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-300 transition-colors"
                                title="Buscar Dirección"
                            >
                                <span className={`material-symbols-outlined text-sm ${isGeocoding ? 'animate-spin' : ''}`}>
                                    {isGeocoding ? 'autorenew' : 'search'}
                                </span>
                            </button>
                        </div>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-2xl border border-blue-100 dark:border-blue-800">
                        <h4 className="font-bold text-blue-900 dark:text-blue-200 text-sm mb-2">Distancia Estimada</h4>
                        <div className="flex justify-between items-center">
                            <span className="text-blue-700 dark:text-blue-300 text-xs">Desde planta:</span>
                            <span className="text-blue-900 dark:text-blue-100 font-bold text-lg">{distance} km</span>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2 h-[400px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm relative z-0">
                    <MapContainer
                        key={`${plantaLocation.lat}-${plantaLocation.lng}`} // Only re-mount if center changes drastically
                        center={[plantaLocation.lat, plantaLocation.lng]}
                        zoom={11}
                        scrollWheelZoom={true}
                        style={{ height: '100%', width: '100%' }}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <MapController center={position || [plantaLocation.lat, plantaLocation.lng]} />

                        {/* Planta Marker */}
                        <Marker position={[plantaLocation.lat, plantaLocation.lng]} icon={DefaultIcon}>
                            <Popup>Planta Operativa (Origen)</Popup>
                        </Marker>

                        {/* Cost/distance Rings */}
                        {rings && rings.map((ring: any, index: number) => (
                            <Circle
                                key={index}
                                center={[plantaLocation.lat, plantaLocation.lng]}
                                radius={getBandRadius(ring.range, ring.radius || 1000)} // Calculate from range string
                                pathOptions={{
                                    color: ring.ringColor || 'blue',
                                    fillColor: ring.ringColor || 'blue',
                                    fillOpacity: 0.1
                                }}
                            />
                        ))}

                        {/* Project Location Marker */}
                        <LocationMarker position={position} setPosition={handlePositionChange} />
                    </MapContainer>
                </div>
            </div>
        </div>
    );
}
