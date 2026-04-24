import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { api, type Role } from '../../services/api';
import './Organigrama.css';

// --- Icons (Material-ready or inline SVG) ---
const Icon = ({ name, className = "" }: { name: string, className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

type ViewMode = 'EMPRESA' | 'CORPORATIVO' | 'OPERATIVO';

interface OrganigramaProps {
    onBack: () => void;
}

const getRoleIcon = (roleName: string) => {
    const name = roleName.toLowerCase();
    if (name.includes('gerente general')) return 'person';
    if (name.includes('administrador')) return 'assessment';
    if (name.includes('asistente') || name.includes('secretaria')) return 'article';
    if (name.includes('ventas') || name.includes('comercial') || name.includes('tablero')) return 'shopping_bag';
    if (name.includes('almacen') || name.includes('logistica') || name.includes('logística')) return 'inventory_2';
    if (name.includes('metal')) return 'precision_manufacturing';
    if (name.includes('melamina')) return 'layers';
    if (name.includes('corte')) return 'content_cut';
    if (name.includes('supervisor')) return 'visibility';
    if (name.includes('obra')) return 'construction';
    if (name.includes('planta') || name.includes('operario')) return 'factory';
    if (name.includes('diseño') || name.includes('arquitecto')) return 'architecture';
    return 'person_outline';
};

const CATEGORIES = [
    { id: 'FUNCION_MAIN', label: 'Funciones Principales' },
    { id: 'FUNCION_SEC', label: 'Funciones Secundarias' },
    { id: 'PROCESO', label: 'Procesos' },
    { id: 'KPI', label: 'KPIs' },
    { id: 'RELACION', label: 'Relaciones' },
    { id: 'COMP_TEC', label: 'Competencias Técnicas' },
    { id: 'COMP_BLANDA', label: 'Competencias Blandas' },
    { id: 'HERRAMIENTA', label: 'Herramientas' },
    { id: 'CONDICION', label: 'Alcances y Condiciones' }
] as const;

export default function Organigrama({ onBack }: OrganigramaProps) {
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>('EMPRESA');
    const [personalStaff, setPersonalStaff] = useState<any[]>([]);
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Partial<Role> | null>(null);
    const [showDetailsPanel, setShowDetailsPanel] = useState(false);

    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [bulkTargetCat, setBulkTargetCat] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [deleteConfirmStep, setDeleteConfirmStep] = useState<0 | 1 | 2>(0);
    const [roleToDelete, setRoleToDelete] = useState<string | null>(null);
    const [activePath, setActivePath] = useState<string[]>([]);

    const containerRef = useRef<HTMLDivElement>(null);

    const fetchRoles = async () => {
        setLoading(true);
        try {
            const data = await api.getRoles();
            setRoles(data);
        } catch (error) {
            console.error("Error fetching roles:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRoles();
        fetchPersonal();
    }, []);

    const fetchPersonal = async () => {
        try {
            const data = await api.getPersonalStaff();
            setPersonalStaff(data);
        } catch (error) {
            console.error("Error al cargar personal:", error);
        }
    };

    const handleSaveRole = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingRole || isSaving) return;
        
        setIsSaving(true);
        try {
            // Populate supervisa_a with current subordinates before saving
            const subordinates = roles.filter(r => r.parent_id === editingRole.id && editingRole.id);
            const supervisaText = subordinates.map(s => s.nombre_cargo).join(', ');
            
            const roleToSave = { 
                ...editingRole, 
                supervisa_a: subordinates.length > 0 ? supervisaText : 'Nadie directamente'
            };

            await api.saveRole(roleToSave as Role);
            setIsFormOpen(false);
            setEditingRole(null);
            await fetchRoles();
            setNotification({ type: 'success', message: '¡Información del puesto guardada correctamente!' });
        } catch (error: any) {
            setNotification({ type: 'error', message: 'Error al guardar: ' + error.message });
        } finally {
            setIsSaving(false);
            setTimeout(() => setNotification(null), 4000);
        }
    };

    const handleDeleteRole = async (id: string) => {
        const hasSubordinates = roles.some(r => r.parent_id === id);
        if (hasSubordinates) {
            setNotification({ 
                type: 'error', 
                message: 'ESTRUCTURA PROTEGIDA: No se puede eliminar un rol si tiene personal u otros puestos a su cargo. Reasigne los dependientes primero.' 
            });
            setTimeout(() => setNotification(null), 5000);
            return;
        }

        setRoleToDelete(id);
        setDeleteConfirmStep(1);
    };

    const processDeletion = async () => {
        if (!roleToDelete) return;
        try {
            await api.deleteRole(roleToDelete);
            setNotification({ type: 'success', message: 'ELIMINADO: Puesto eliminado con éxito' });
            setDeleteConfirmStep(0);
            setRoleToDelete(null);
            fetchRoles();
            setShowDetailsPanel(false);
        } catch (error: any) {
            setNotification({ type: 'error', message: 'Error al eliminar: ' + error.message });
        } finally {
            setTimeout(() => setNotification(null), 4000);
        }
    };

    const handleConfirmBulk = (text: string) => {
        if (!bulkTargetCat || !editingRole) return;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const currentDetails = editingRole.detalles_rol || [];
        const newDetails = lines.map(line => ({ categoria: bulkTargetCat as any, descripcion: line }));
        setEditingRole({ ...editingRole, detalles_rol: [...currentDetails, ...newDetails] });
        setIsBulkModalOpen(false);
        setBulkTargetCat(null);
    };
    // Helper to build tree structure
    const roleTree = useMemo(() => {
        const map = new Map<string, any>();
        // Ordenar roles antes de mapear para asegurar consistencia
        const sortedRoles = [...roles].sort((a, b) => (Number(a.jerarquia) || 0) - (Number(b.jerarquia) || 0));
        
        sortedRoles.forEach(role => map.set(role.id!, { ...role, children: [] }));
        const roots: any[] = [];
        
        sortedRoles.forEach(role => {
            if (role.parent_id && map.has(role.parent_id)) {
                map.get(role.parent_id).children.push(map.get(role.id!));
                // Ordenar hijos por jerarquía dentro de cada nodo
                map.get(role.parent_id).children.sort((a: any, b: any) => (Number(a.jerarquia) || 0) - (Number(b.jerarquia) || 0));
            } else {
                roots.push(map.get(role.id!));
            }
        });
        return roots;
    }, [roles]);

    const handleNodeSelect = React.useCallback((node: Role) => {
        // Find parents
        const path: string[] = [];
        let current: any = node;
        while (current) {
            path.push(current.id);
            current = roles.find(r => r.id === current.parent_id);
        }
        setActivePath(path);
        setSelectedRole(node);
        // We no longer open the details panel on single click
    }, [roles]);

    const handleNodeOpenDetails = React.useCallback((node: Role) => {
        handleNodeSelect(node);
        setShowDetailsPanel(true);
    }, [handleNodeSelect]);

    const handleDownloadHTML = () => {
        // @ts-ignore
        const htmlContent = generateStaticHTML(roleTree, viewMode, roles);
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Organigrama_${viewMode}_${new Date().toISOString().split('T')[0]}.html`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="organigrama-container">
            {/* Header / Controls */}
            <div className="organigrama-header">
                <div className="flex items-center gap-4">
                    <button className="button-icon" onClick={onBack}>
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <h1>Organigrama Dinámico</h1>
                </div>

                <div className="flex gap-3 items-center">
                    <div className="view-toggle">
                        <button 
                            className={viewMode === 'EMPRESA' ? 'active' : ''} 
                            onClick={() => setViewMode('EMPRESA')}
                        >
                            Empresa
                        </button>
                        <button 
                            className={viewMode === 'CORPORATIVO' ? 'active' : ''} 
                            onClick={() => setViewMode('CORPORATIVO')}
                        >
                            Corporativo
                        </button>
                    </div>

                    <button className="button-icon" onClick={handleDownloadHTML} title="Exportar Organigrama a HTML" style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#6366f1' }}>
                        <Icon name="download" />
                    </button>

                    <button className="button primary" onClick={() => { setEditingRole({ dotacion: 1, detalles_rol: [] }); setIsFormOpen(true); }}>
                        <Icon name="add" /> Nuevo Rol
                    </button>
                </div>
            </div>

            {/* Main Viewing Area */}
            <div 
                className="organigrama-viewport custom-scrollbar" 
                ref={containerRef}
                onClick={() => { setActivePath([]); setSelectedRole(null); setShowDetailsPanel(false); }}
            >
                {loading ? (
                    <div className="flex justify-center items-center h-full">
                        <p className="loading-text">Cargando Estructura...</p>
                    </div>
                ) : (
                    <div className="tree-wrapper">
                        {roleTree.map(root => (
                            <TreeNode 
                                key={root.id} 
                                node={root} 
                                viewMode={viewMode}
                                activePath={activePath}
                                onSelect={handleNodeSelect}
                                onOpenDetails={handleNodeOpenDetails}
                                level={0}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Details Panel (Side) — portal so backdrop covers the sidebar */}
            {showDetailsPanel && selectedRole && createPortal(
                <div className="role-details-overlay" onClick={() => setShowDetailsPanel(false)}>
                    <div className="role-details-panel shadow-2xl" onClick={e => e.stopPropagation()}>
                        <RoleDetailsView
                            role={selectedRole}
                            roles={roles}
                            onEdit={() => { setEditingRole(selectedRole); setIsFormOpen(true); }}
                            onDelete={() => handleDeleteRole(selectedRole.id!)}
                            onClose={() => setShowDetailsPanel(false)}
                        />
                    </div>
                </div>,
                document.body
            )}

            {/* Form Modal — portal so backdrop covers sidebar; paddingLeft offsets sidebar width */}
            {isFormOpen && createPortal(
                <div className="modal-overlay" style={{ paddingLeft: '80px' }}>
                    <div className="role-form-modal custom-scrollbar shadow-2xl">
                        <RoleForm
                            role={editingRole || {}}
                            roles={roles}
                            setRole={setEditingRole}
                            onSave={handleSaveRole}
                            onCancel={() => { setIsFormOpen(false); setEditingRole(null); }} 
                            onOpenBulk={(cat) => { setBulkTargetCat(cat); setIsBulkModalOpen(true); }}
                            isSaving={isSaving}
                            personalStaff={personalStaff}
                        />
                    </div>
                </div>,
                document.body
            )}

            {/* Bulk Paste Modal */}
            {isBulkModalOpen && (
                <BulkPasteModal
                    category={bulkTargetCat || ''}
                    onConfirm={handleConfirmBulk}
                    onCancel={() => { setIsBulkModalOpen(false); setBulkTargetCat(null); }}
                />
            )}

            {/* Confirmation Modals */}
            {deleteConfirmStep === 1 && (
                <ConfirmModal
                    title="¿Desea eliminar este puesto?"
                    message="Se borrarán también todas sus funciones y metas asociadas."
                    confirmLabel="Sí, continuar"
                    cancelLabel="Cancelar"
                    onConfirm={() => setDeleteConfirmStep(2)}
                    onCancel={() => { setDeleteConfirmStep(0); setRoleToDelete(null); }}
                />
            )}

            {deleteConfirmStep === 2 && (
                <ConfirmModal
                    type="danger"
                    title="¡ALERTA DE SEGURIDAD!"
                    message="¿Está realmente seguro? Esta acción es irreversible y podría afectar la jerarquía de la empresa."
                    confirmLabel="ELIMINAR DEFINITIVAMENTE"
                    cancelLabel="Regresar"
                    onConfirm={processDeletion}
                    onCancel={() => setDeleteConfirmStep(1)}
                />
            )}

            {/* Notifications */}
            {notification && (
                <NotificationPopup 
                    type={notification.type} 
                    message={notification.message} 
                    onClose={() => setNotification(null)} 
                />
            )}
        </div>
    );
}

function ConfirmModal({ 
    type = 'primary', 
    title, 
    message, 
    confirmLabel, 
    cancelLabel, 
    onConfirm, 
    onCancel 
}: { 
    type?: 'primary' | 'danger', 
    title: string, 
    message: string, 
    confirmLabel: string, 
    cancelLabel: string, 
    onConfirm: () => void, 
    onCancel: () => void 
}) {
    return createPortal(
        <div className="modal-overlay" style={{ zIndex: 4000, paddingLeft: '80px' }}>
            <div className="bg-white w-full max-w-md p-8 rounded-[32px] shadow-2xl flex flex-col items-center text-center gap-6 animate-slide-in">
                <div className={`w-16 h-16 rounded-3xl flex items-center justify-center ${
                    type === 'danger' ? 'bg-rose-500 text-white shadow-lg shadow-rose-100' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                }`}>
                    <Icon name={type === 'danger' ? 'warning' : 'help_outline'} className="!text-3xl" />
                </div>
                <div>
                    <h2 className={`text-xl font-black uppercase tracking-tight ${type === 'danger' ? 'text-rose-600' : 'text-slate-800'}`}>
                        {title}
                    </h2>
                    <p className="mt-2 text-slate-500 text-sm font-medium leading-relaxed">
                        {message}
                    </p>
                </div>
                <div className="flex flex-col w-full gap-3 mt-4">
                    <button
                        type="button"
                        className={`button !py-4 w-full shadow-lg ${type === 'danger' ? 'bg-rose-600 !text-white' : 'primary'}`} 
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </button>
                    <button type="button" className="button secondary !py-4 w-full" onClick={onCancel}>
                        {cancelLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

function NotificationPopup({ type, message, onClose }: { type: 'success' | 'error', message: string, onClose: () => void }) {
    return (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[5000] animate-slide-in">
            <div className={`flex items-center gap-4 px-6 py-4 rounded-2xl shadow-2xl border ${
                type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-rose-50 border-rose-100 text-rose-600'
            }`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                }`}>
                    <Icon name={type === 'success' ? 'check_circle' : 'error'} className="!text-xl" />
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-60">
                        {type === 'success' ? 'Operación Exitosa' : 'Ha ocurrido un error'}
                    </p>
                    <p className="text-sm font-black">{message}</p>
                </div>
                <button 
                    onClick={onClose} 
                    className="ml-6 w-8 h-8 rounded-full hover:bg-black/5 flex items-center justify-center transition-colors"
                >
                    <Icon name="close" className="!text-lg opacity-40" />
                </button>
            </div>
        </div>
    );
}

// --- Subcomponents ---

const TreeNode = React.memo(({ node, viewMode, onSelect, onOpenDetails, activePath, level }: { node: any, viewMode: ViewMode, onSelect: (role: Role) => void, onOpenDetails: (role: Role) => void, activePath: string[], level: number }) => {
    const isActive = activePath.includes(node.id);
    const isSelected = activePath[0] === node.id;
    const activeChildId = node.children?.find((c: any) => activePath.includes(c.id))?.id;
    const hasActiveChild = !!activeChildId;

    // Hierarchy Colors
    const borderColor = level === 0 ? '#B68D40' : level === 1 ? '#001B36' : '#00162B';
    
    // Stagger delay based on distance from root in the active path
    const pathIndex = activePath.indexOf(node.id);
    const animDelay = pathIndex !== -1 ? (activePath.length - 1 - pathIndex) * 0.3 : 0;
    
    // ... rest of useLayoutEffect and logic remains the same ...
    const rowRef = React.useRef<HTMLDivElement>(null);
    const [linePositions, setLinePositions] = React.useState<{
        centers: number[], wrapperEdges: number[], dropX: number, rowHeight: number, cardBottom: number
    }>({ centers: [], wrapperEdges: [], dropX: 0, rowHeight: 0, cardBottom: 0 });
    
    const childCount = node.children?.length || 0;
    
    React.useLayoutEffect(() => {
        const row = rowRef.current;
        if (!row || childCount === 0) return;
        
        const updatePositions = () => {
            const wrappers = row.querySelectorAll(':scope > .horizontal-connector-wrapper');
            const rowRect = row.getBoundingClientRect();
            if (rowRect.width === 0) return;

            let cardB = 0;
            const wrapperEdges: number[] = [];
            const centers = Array.from(wrappers).map((w) => {
                const r = w.getBoundingClientRect();
                wrapperEdges.push(r.right - rowRect.left);
                
                const card = w.querySelector('.node-card');
                if (card) {
                    const cardRect = card.getBoundingClientRect();
                    const b = cardRect.bottom - rowRect.top + 36;
                    if (b > cardB) cardB = b;
                    return (cardRect.left + cardRect.width / 2) - rowRect.left;
                }
                return (r.left + r.width / 2) - rowRect.left;
            });

            const containerLine = row.parentElement?.querySelector(':scope > .children-container-line');
            let dropX = rowRect.width / 2;
            if (containerLine) {
                const clRect = containerLine.getBoundingClientRect();
                dropX = (clRect.left + clRect.width / 2) - rowRect.left;
            }
            const h = rowRect.height > 10 ? rowRect.height : 200;
            setLinePositions({ centers, wrapperEdges, dropX, rowHeight: h, cardBottom: cardB });
        };

        updatePositions();
        const timer = setTimeout(updatePositions, 200);
        return () => clearTimeout(timer);
    }, [childCount, activePath, viewMode]);
    
    return (
        <div className={`tree-node-container ${isActive ? 'active-branch' : ''}`}>
            {/* Vertical connector to parent/sibling-bar */}
            <div className={`tree-node-center-line ${isActive ? 'active' : ''}`}>
                {isActive && activePath[activePath.length - 1] !== node.id && (
                    <div className="pulse-light-v" style={{ animationDelay: `${animDelay}s` }}></div>
                )}
            </div>
            
            <div 
                className={`node-card ${isSelected ? 'active-card' : isActive ? 'active-path-card' : ''}`} 
                style={{ borderColor: isSelected ? borderColor : `${borderColor}1A` }} // 1A is ~10% opacity in hex
                onClick={(e) => { e.stopPropagation(); onSelect(node); }}
                onDoubleClick={(e) => { e.stopPropagation(); onOpenDetails(node); }}
            >
                <div className="node-icon">
                    <Icon name={getRoleIcon(node.nombre_cargo)} />
                </div>
                <div className="node-info">
                    <h3 className="role-title">{node.nombre_cargo}</h3>
                    {viewMode === 'CORPORATIVO' && node.rango_salarial && (
                        <p className="salary-range">({node.rango_salarial})</p>
                    )}
                    <p className="occupant-name">{node.nombres || 'Puesto Vacante'}</p>
                    {viewMode === 'CORPORATIVO' && node.sueldo && (
                        <p className="salary-actual">S/ {node.sueldo}</p>
                    )}
                    <div className="node-schedule">
                        <span className="material-symbols-outlined text-[12px]">schedule</span>
                        {node.horario || 'No definido'}
                    </div>
                    {node.dotacion > 1 && <span className="dotacion-badge">x{node.dotacion}</span>}
                </div>
                
                {/* Visual indicator for single-click selection (pulsing halo) */}
                {isSelected && <div className="click-pulse-halo"></div>}
            </div>
            
            {node.children && node.children.length > 0 && (() => {
                // Sort children by area then by jerarquía so same-area nodes are always
                // consecutive — prevents duplicate area labels when hierarchy ordering
                // would otherwise interleave nodes from different areas.
                const sortedChildren = [...node.children].sort((a: any, b: any) => {
                    const aArea = (a.area || 'Sin área').trim().toLowerCase();
                    const bArea = (b.area || 'Sin área').trim().toLowerCase();
                    if (aArea !== bArea) return aArea.localeCompare(bArea, 'es');
                    return (Number(a.jerarquia) || 0) - (Number(b.jerarquia) || 0);
                });

                const activeIdx = sortedChildren.findIndex((c: any) => activePath.includes(c.id));
                const midIdx = (sortedChildren.length - 1) / 2;

                const areas: any[] = [];
                let currentArea = '';
                sortedChildren.forEach((child: any, idx: number) => {
                    const normArea = (child.area || 'Sin área').trim();
                    if (normArea !== currentArea) {
                        areas.push({ name: normArea, startIdx: idx });
                        currentArea = normArea;
                    }
                });

                const travelDir = activeIdx > midIdx ? 'to-right' : 'to-left';

                // Gray line from first to last center
                const firstCenter = linePositions.centers[0] ?? 0;
                const lastCenter = linePositions.centers[linePositions.centers.length - 1] ?? 0;

                // Active (blue) segment: from active child center to parent's REAL drop X
                let activeLine = { left: 0, width: 0, show: false };
                if (hasActiveChild && activeIdx >= 0 && linePositions.centers.length > 0) {
                    const activeCenter = linePositions.centers[activeIdx];
                    const dropCenter = linePositions.dropX; // Real vertical drop position
                    if (activeCenter !== undefined && dropCenter !== undefined) {
                        const left = Math.min(activeCenter, dropCenter);
                        const right = Math.max(activeCenter, dropCenter);
                        activeLine = { left, width: right - left, show: true };
                    }
                }

                return (
                    <div className={`children-container ${hasActiveChild ? 'active-path' : ''}`}>
                        <div className="children-container-line">
                            {hasActiveChild && <div className="pulse-light-v" style={{ animationDelay: `${animDelay + 0.2}s` }}></div>}
                        </div>
                        <div className="children-row" ref={rowRef}>
                            {linePositions.centers.length > 1 && (
                                <div 
                                    className="h-line-bar" 
                                    style={{ left: `${firstCenter}px`, width: `${lastCenter - firstCenter}px` }}
                                />
                            )}
                            {activeLine.show && (
                                <div 
                                    className="h-line-bar active" 
                                    style={{ left: `${activeLine.left}px`, width: `${activeLine.width}px` }}
                                >
                                    <div className={`pulse-light-h full ${travelDir}`} style={{ animationDelay: `${animDelay + 0.3}s` }}></div>
                                </div>
                            )}
                            {/* Area dividers and labels — absolutely positioned */}
                            {linePositions.centers.length > 0 && linePositions.cardBottom > 50 && (
                                <>
                                    {areas.map((areaInfo, aIdx) => {
                                        const isFirst = aIdx === 0;
                                        const prevGroupEndIdx = areaInfo.startIdx - 1;
                                        const thisGroupStartIdx = areaInfo.startIdx;
                                        
                                        // Center calculation for THIS area group
                                        const nextAreaStartIdx = aIdx + 1 < areas.length ? areas[aIdx + 1].startIdx : node.children.length;
                                        const groupEndIdx = nextAreaStartIdx - 1;
                                        const startC = linePositions.centers[thisGroupStartIdx];
                                        const endC = linePositions.centers[groupEndIdx];
                                        
                                        if (startC === undefined || endC === undefined) return null;
                                        const labelCenterX = (startC + endC) / 2;

                                        return (
                                            <React.Fragment key={`area-group-${aIdx}`}>
                                                {!isFirst && (
                                                    <div 
                                                        className="area-divider" 
                                                        style={{ 
                                                            left: `${linePositions.wrapperEdges[prevGroupEndIdx]}px`, 
                                                            height: `${linePositions.rowHeight}px`,
                                                            top: 0
                                                        }}
                                                    />
                                                )}
                                                {areaInfo.name !== 'Sin área' && (
                                                    <div 
                                                        className="flat-area-label" 
                                                        style={{ left: `${labelCenterX}px`, top: `${linePositions.cardBottom}px`, transform: 'translateX(-50%)' }}
                                                    >{areaInfo.name}</div>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </>
                            )}
                            {sortedChildren.map((child: any) => {
                                return (
                                    <div key={child.id} className="horizontal-connector-wrapper">
                                        <TreeNode 
                                            node={child} 
                                            viewMode={viewMode} 
                                            onSelect={onSelect} 
                                            onOpenDetails={onOpenDetails}
                                            activePath={activePath} 
                                            level={level + 1}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
});

function RoleDetailsView({ role, roles, onEdit, onDelete, onClose }: { role: Role, roles: Role[], onEdit: () => void, onDelete: () => void, onClose: () => void }) {
    const subordinates = roles.filter(r => r.parent_id === role.id && role.id);

    return (
        <div className="p-6">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h2 className="text-2xl font-black">{role.nombre_cargo}</h2>
                    <p className="text-slate-500 uppercase text-xs font-bold tracking-widest">{role.area}</p>
                </div>
                <div className="flex gap-2">
                    <button className="button-icon edit" title="Editar Puesto" onClick={onEdit}><Icon name="edit" /></button>
                    <button 
                        className={`button-icon delete ${subordinates.length > 0 ? 'opacity-30 cursor-not-allowed bg-slate-100 hover:bg-slate-100' : ''}`} 
                        title={subordinates.length > 0 ? "Estructura Protegida: Reasigne dependientes antes de poder eliminar" : "Eliminar Puesto"} 
                        onClick={onDelete}
                        disabled={subordinates.length > 0}
                    >
                        <Icon name="delete" />
                    </button>
                    <button className="button-icon close" onClick={onClose}><Icon name="close" /></button>
                </div>
            </div>

            <div className="space-y-6">
                <section>
                    <h4 className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase mb-2"><Icon name="target" className="!text-sm" /> Propósito</h4>
                    <p className="text-sm bg-slate-50 p-3 rounded-lg border border-slate-100">{role.proposito || 'Sin propósito definido.'}</p>
                </section>

                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Reporta a:</span>
                        <p className="text-sm font-semibold">{role.reporta_a || 'Gerente General (Máximo Cargo)'}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Supervisa a ({subordinates.length}):</span>
                        <div className="flex flex-wrap gap-1 mt-1 max-h-[80px] overflow-y-auto custom-scrollbar pr-1">
                            {subordinates.length > 0 ? subordinates.map(s => (
                                <span key={s.id} className="text-[9px] font-black uppercase px-2 py-0.5 bg-white border border-slate-200 rounded-full text-slate-600">
                                    {s.nombre_cargo}
                                </span>
                            )) : (
                                <p className="text-sm font-semibold">Nadie directamente</p>
                            )}
                        </div>
                    </div>
                </div>

                {CATEGORIES.map(cat => {
                    const items = role.detalles_rol?.filter(d => d.categoria === cat.id) || [];
                    if (items.length === 0) return null;
                    return (
                        <section key={cat.id}>
                            <h4 className="text-xs font-bold text-indigo-600 uppercase mb-2">{cat.label}</h4>
                            <ul className="list-disc pl-5 text-sm space-y-1">
                                {items.map((item, i) => <li key={i}>{item.descripcion}</li>)}
                            </ul>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}

function RoleForm({ role, roles, setRole, onSave, onCancel, onOpenBulk, isSaving, personalStaff }: { 
    role: Partial<Role>, 
    roles: Role[],
    setRole: (r: any) => void, 
    onSave: (e: React.FormEvent<HTMLFormElement>) => void, 
    onCancel: () => void,
    onOpenBulk: (catId: string) => void,
    isSaving: boolean,
    personalStaff: any[]
}) {
    const subordinates = roles.filter(r => r.parent_id === role.id && role.id);
    const parentRole = roles.find(r => r.id === role.parent_id);
    const [blockToDelete, setBlockToDelete] = useState<string | null>(null);

    const confirmDeleteBlock = () => {
        if (!blockToDelete) return;
        const details = (role.detalles_rol || []).filter(d => d.categoria !== blockToDelete);
        setRole({ ...role, detalles_rol: details });
        setBlockToDelete(null);
    };

    const handleAddDetail = (catId: string) => {
        const details = [...(role.detalles_rol || [])];
        details.push({ categoria: catId as any, descripcion: "" });
        setRole({ ...role, detalles_rol: details });
    };

    const handleDetailChange = (index: number, val: string) => {
        const details = [...(role.detalles_rol || [])];
        details[index].descripcion = val;
        setRole({ ...role, detalles_rol: details });
    };

    const handleRemoveDetail = (index: number) => {
        const details = [...(role.detalles_rol || [])];
        details.splice(index, 1);
        setRole({ ...role, detalles_rol: details });
    };

    const handleBulkPaste = (catId: string) => {
        onOpenBulk(catId);
    };

    const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const DAY_MAP: { [key: string]: string } = {
        'L': 'Lunes', 'M': 'Martes', 'Mi': 'Miércoles', 'J': 'Jueves', 'V': 'Viernes', 'S': 'Sábado', 'D': 'Domingo',
        'LUN': 'Lunes', 'MAR': 'Martes', 'MIE': 'Miércoles', 'JUE': 'Jueves', 'VIE': 'Viernes', 'SAB': 'Sábado', 'DOM': 'Domingo',
        'LUNES': 'Lunes', 'MARTES': 'Martes', 'MIERCOLES': 'Miércoles', 'JUEVES': 'Jueves', 'VIERNES': 'Viernes', 'SABADO': 'Sábado', 'DOMINGO': 'Domingo'
    };
    const HOURS = Array.from({ length: 48 }, (_, i) => {
        const h = Math.floor(i / 2).toString().padStart(2, '0');
        const m = (i % 2 === 0 ? '00' : '30');
        return `${h}:${m}`;
    });

    const handleNoSignNumber = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (['e', 'E', '+', '-', ','].includes(e.key)) e.preventDefault();
    };

    // Helper to update range
    const updateRange = (min: string, max: string) => {
        setRole({ ...role, rango_salarial: `${min} - ${max}` });
    };

    // Helper to update schedule
    const updateSchedule = (d1: string, d2: string, h1: string, h2: string) => {
        setRole({ ...role, horario: `${d1}-${d2} ${h1}-${h2}` });
    };

    // Parse existing horario for display
    const currentHorario = role.horario || 'Lunes-Viernes 08:00-18:00';
    const hParts = currentHorario.split(' ');
    const dRange = (hParts[0] || 'Lunes-Viernes').split('-');
    const tRange = (hParts[1] || '08:00-18:00').split('-');
    
    // Normalize weekday names
    const normalizeDay = (d: string) => {
        const upper = d.toUpperCase();
        return DAY_MAP[upper] || (DAYS.includes(d) ? d : 'Lunes');
    };

    const d1 = normalizeDay(dRange[0] || 'Lunes');
    const d2 = normalizeDay(dRange[1] || 'Viernes');
    const t1 = tRange[0] || '08:00';
    const t2 = tRange[1] || '18:00';

    // Parse existing range for display
    const currentRange = role.rango_salarial || '0 - 0';
    const rParts = currentRange.split('-').map(p => p.trim());
    const r1 = rParts[0] || '0';
    const r2 = rParts[1] || '0';

    const minSal = parseFloat(r1) || 0;
    const maxSal = parseFloat(r2) || 0;
    const currentSal = role.sueldo || 0;
    const isOutOfRange = (minSal > 0 || maxSal > 0) && (currentSal < minSal || currentSal > maxSal);

    return (
        <form onSubmit={onSave} className="p-8">
            <div className="flex justify-between items-center mb-8 sticky top-0 bg-white z-10 py-2 border-b border-slate-100">
                <div>
                    <h2 className="text-2xl font-black uppercase tracking-tight">{role.id ? 'Actualizar Información del Puesto' : 'Crear Nuevo Rol'}</h2>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Complete los campos detallados para la gestión organizacional</p>
                </div>
                <div className="flex gap-3">
                    <button type="button" className="button secondary" onClick={onCancel} disabled={isSaving}>Cancelar</button>
                    <button 
                        type="submit" 
                        className="button primary !py-3 !px-8 shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:grayscale transition-all" 
                        disabled={isSaving || isOutOfRange}
                    >
                        {isSaving ? 'Guardando...' : (role.id ? 'Actualizar Puesto' : 'Crear Puesto')}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Bloque Izquierdo: Información Básica */}
                <div className="md:col-span-1 space-y-6">
                    <section className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4">
                        <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                            <Icon name="info" className="!text-sm" /> Datos Principales
                        </h3>
                        
                        <div className="form-group">
                            <label>Nombre del Cargo</label>
                            <input 
                                required
                                value={role.nombre_cargo || ''} 
                                onChange={e => setRole({ ...role, nombre_cargo: e.target.value })} 
                                placeholder="Ej: Gerente de Proyectos"
                            />
                        </div>

                        <div className="form-group">
                            <label>Área / Departamento</label>
                            <input 
                                required
                                value={role.area || ''} 
                                onChange={e => setRole({ ...role, area: e.target.value })} 
                                placeholder="Ej: Operaciones"
                            />
                        </div>

                        <div className="form-group">
                            <label>Puesto Superior (Reporta a)</label>
                            <select 
                                value={role.parent_id || ''} 
                                onChange={e => {
                                    const pId = e.target.value;
                                    const parent = roles.find(r => r.id === pId);
                                    setRole({ 
                                        ...role, 
                                        parent_id: pId || null,
                                        reporta_a: parent ? parent.nombre_cargo : 'Gerente General',
                                        jerarquia: parent ? (Number(parent.jerarquia) || 1) + 1 : 1
                                    });
                                }}
                            >
                                <option value="">--- Máxima Jerarquía ---</option>
                                {roles.filter(r => r.id !== role.id).map(r => (
                                    <option key={r.id} value={r.id}>{r.nombre_cargo} ({r.area})</option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="form-group">
                                <label>Jerarquía (Nivel)</label>
                                <input 
                                    type="number"
                                    min="1"
                                    value={role.jerarquia || ''} 
                                    onChange={e => setRole({ ...role, jerarquia: parseInt(e.target.value) })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Dotación (Puestos)</label>
                                <input 
                                    type="number"
                                    min="1"
                                    value={role.dotacion || 1} 
                                    onChange={e => setRole({ ...role, dotacion: parseInt(e.target.value) || 1 })}
                                />
                            </div>
                        </div>
                    </section>

                    <section className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4">
                        <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                            <Icon name="payments" className="!text-sm" /> Compensación
                        </h3>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="form-group">
                                <label>Rango Min.</label>
                                <input 
                                    type="number"
                                    onKeyDown={handleNoSignNumber}
                                    value={r1} 
                                    onChange={e => updateRange(e.target.value, r2)}
                                />
                            </div>
                            <div className="form-group">
                                <label>Rango Max.</label>
                                <input 
                                    type="number"
                                    onKeyDown={handleNoSignNumber}
                                    value={r2} 
                                    onChange={e => updateRange(r1, e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Sueldo Actual Asignado</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">S/</span>
                                <input 
                                    type="number"
                                    step="0.01"
                                    className={`!pl-10 ${isOutOfRange ? 'border-rose-500 bg-rose-50' : ''}`}
                                    onKeyDown={handleNoSignNumber}
                                    value={role.sueldo || ''} 
                                    onChange={e => setRole({ ...role, sueldo: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                            {isOutOfRange && (
                                <p className="text-[10px] font-bold text-rose-500 uppercase mt-1 animate-pulse">
                                    ⚠️ El sueldo está fuera del rango definido
                                </p>
                            )}
                        </div>
                    </section>

                    <section className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4">
                        <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                            <Icon name="schedule" className="!text-sm" /> Horario y Disponibilidad
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                            <select value={d1} onChange={e => updateSchedule(e.target.value, d2, t1, t2)}>
                                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                            <select value={d2} onChange={e => updateSchedule(d1, e.target.value, t1, t2)}>
                                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <select value={t1} onChange={e => updateSchedule(d1, d2, e.target.value, t2)}>
                                {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                            <select value={t2} onChange={e => updateSchedule(d1, d2, t1, e.target.value)}>
                                {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                        </div>
                    </section>

                    <section className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4">
                        <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                            <Icon name="person" className="!text-sm" /> Asignación de Personal
                        </h3>
                        <div className="form-group">
                            <label>Colaborador Actual</label>
                            <select 
                                value={role.dni || ''} 
                                onChange={e => {
                                    const selectedDni = e.target.value;
                                    const person = personalStaff.find(p => p.dni === selectedDni);
                                    setRole({ 
                                        ...role, 
                                        dni: selectedDni || null,
                                        nombres: person ? `${person.nombres} ${person.apellidos}` : ''
                                    });
                                }}
                            >
                                <option value="">--- Puesto Vacante ---</option>
                                {personalStaff.map(p => (
                                    <option key={p.dni} value={p.dni}>{p.nombres} {p.apellidos} ({p.dni})</option>
                                ))}
                            </select>
                        </div>
                    </section>
                </div>

                {/* Bloque Derecho: Detalles del Rol (Funciones, KPIs, etc) */}
                <div className="md:col-span-2 space-y-8">
                    <section className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight mb-4 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                <Icon name="description" className="!text-lg" />
                            </div>
                            Propósito General del Puesto
                        </h3>
                        <textarea 
                            className="w-full min-h-[120px] p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-100 transition-all font-medium text-slate-600"
                            placeholder="Describa brevemente la razón de ser de este puesto en la organización..."
                            value={role.proposito || ''}
                            onChange={e => setRole({ ...role, proposito: e.target.value })}
                        />
                    </section>

                    <div className="grid grid-cols-1 gap-6">
                        {CATEGORIES.map(cat => (
                            <section key={cat.id} className="bg-white p-6 rounded-3xl border border-slate-100">
                                <div className="flex justify-between items-center mb-6">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">{cat.label}</h4>
                                    <div className="flex gap-2">
                                        <button 
                                            type="button" 
                                            className="button secondary !p-2 !h-8" 
                                            onClick={() => handleBulkPaste(cat.id)}
                                            title="Pegar desde Word"
                                        >
                                            <Icon name="content_paste" className="!text-sm" />
                                        </button>
                                        <button 
                                            type="button" 
                                            className="button primary !p-2 !h-8" 
                                            onClick={() => handleAddDetail(cat.id)}
                                        >
                                            <Icon name="add" className="!text-sm" />
                                        </button>
                                        {(role.detalles_rol || []).some(d => d.categoria === cat.id) && (
                                            <button 
                                                type="button" 
                                                className="button-icon delete !w-8 !h-8" 
                                                onClick={() => setBlockToDelete(cat.id)}
                                                title="Limpiar Bloque"
                                            >
                                                <Icon name="delete_sweep" className="!text-sm" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="space-y-3">
                                    {(role.detalles_rol || []).filter(d => d.categoria === cat.id).length > 0 ? (
                                        (role.detalles_rol || []).filter(d => d.categoria === cat.id).map((detail) => {
                                            const index = role.detalles_rol!.indexOf(detail);
                                            return (
                                                <div key={index} className="flex gap-2 group">
                                                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 mt-2 shrink-0">
                                                        {role.detalles_rol!.filter(d => d.categoria === cat.id).indexOf(detail) + 1}
                                                    </div>
                                                    <textarea 
                                                        className="flex-1 !bg-white border-slate-200 focus:border-indigo-400 overflow-hidden resize-none" 
                                                        rows={1}
                                                        style={{ height: 'auto', minHeight: '42px' }}
                                                        value={detail.descripcion} 
                                                        onInput={(e) => {
                                                            const target = e.target as HTMLTextAreaElement;
                                                            target.style.height = 'auto';
                                                            target.style.height = target.scrollHeight + 'px';
                                                        }}
                                                        onFocus={(e) => {
                                                            const target = e.target as HTMLTextAreaElement;
                                                            target.style.height = target.scrollHeight + 'px';
                                                        }}
                                                        onChange={e => handleDetailChange(index, e.target.value)} 
                                                        placeholder={`Ingrese ${cat.label.toLowerCase()}...`} 
                                                    />
                                                    <button 
                                                        type="button" 
                                                        className="opacity-0 group-hover:opacity-100 button-icon delete !w-8 !h-8 !border-none text-slate-300 hover:text-red-500 transition-all" 
                                                        onDoubleClick={() => handleRemoveDetail(index)}
                                                        title="Doble clic para eliminar"
                                                    >
                                                        <Icon name="delete" className="!text-sm" />
                                                    </button>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="text-center py-6 border-2 border-dashed border-slate-50 rounded-2xl">
                                            <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Sin registros asignados</p>
                                        </div>
                                    )}
                                </div>
                            </section>
                        ))}
                    </div>
                </div>
            </div>

            {blockToDelete && (
                <ConfirmModal 
                    type="danger"
                    title="Eliminar Bloque Completo"
                    message={`Se eliminarán permanentemente todos los registros detallados bajo la categoría de "${CATEGORIES.find(c => c.id === blockToDelete)?.label}".`}
                    confirmLabel="Eliminar todo el bloque"
                    cancelLabel="Cancelar"
                    onConfirm={confirmDeleteBlock}
                    onCancel={() => setBlockToDelete(null)}
                />
            )}
        </form>
    );
}

function BulkPasteModal({ category, onConfirm, onCancel }: { 
    category: string, 
    onConfirm: (text: string) => void, 
    onCancel: () => void 
}) {
    const [text, setText] = useState('');
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const catLabel = CATEGORIES.find(c => c.id === category)?.label || category;

    return createPortal(
        <div className="modal-overlay" style={{ zIndex: 3000, paddingLeft: '80px' }}>
            <div className="bg-white w-full max-w-4xl p-8 rounded-[32px] shadow-2xl flex flex-col gap-6 max-h-[90vh]">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-black uppercase">Pegar Bloque: {catLabel}</h2>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Pegue el texto de Word. Cada salto de línea creará un item numerado.</p>
                    </div>
                    <button className="button-icon" onClick={onCancel}><Icon name="close" /></button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 overflow-hidden">
                    <div className="flex flex-col gap-2 h-full">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Área de Pegado</label>
                        <textarea 
                            autoFocus
                            className="flex-1 p-4 border-2 border-slate-100 rounded-2xl bg-slate-50 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all outline-none resize-none font-medium text-sm leading-relaxed"
                            placeholder="Pegue aquí su contenido de Word..."
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                        />
                    </div>
                    
                    <div className="flex flex-col gap-2 h-full overflow-hidden">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Vista Previa Numerada ({lines.length} items)</label>
                        <div className="flex-1 bg-slate-50 rounded-2xl border border-slate-100 p-4 overflow-y-auto custom-scrollbar">
                            {lines.length > 0 ? (
                                <div className="space-y-3">
                                    {lines.map((line, i) => (
                                        <div key={i} className="flex gap-3 animate-slide-in">
                                            <span className="w-6 h-6 shrink-0 bg-white border border-slate-200 rounded-full flex items-center justify-center text-[10px] font-black text-indigo-500 shadow-sm">
                                                {i + 1}
                                            </span>
                                            <p className="text-sm text-slate-600 font-medium pt-0.5">{line}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-30 grayscale p-8">
                                    <Icon name="content_paste" className="!text-5xl mb-4" />
                                    <p className="text-xs font-black uppercase tracking-widest">Esperando contenido...</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex gap-4 pt-4 border-t border-slate-50">
                    <button className="button secondary flex-1 !py-4" onClick={onCancel}>Cancelar</button>
                    <button 
                        className="button primary flex-1 !py-4 shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:grayscale" 
                        disabled={lines.length === 0}
                        onClick={() => onConfirm(text)}
                    >
                        Procesar {lines.length} Items E Importar
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// --- HTML Export Generator ---
function generateStaticHTML(tree: any[], mode: ViewMode, allRoles: Role[]) {
    const title = `Organigrama Dinámico - Modo ${mode}`;
    const date = new Date().toLocaleDateString();

    const renderTreeNodes = (nodes: any[], level: number): string => {
        return nodes.map(node => `
            <div class="tree-node-container">
                ${level > 0 ? '<div class="tree-node-center-line"></div>' : ''}
                <div class="node-card" onclick="showDetails('${node.id}')">
                    <div class="node-icon"><span class="material-symbols-outlined">person</span></div>
                    <div class="node-info">
                        <h3 class="role-title">${node.nombre_cargo}</h3>
                        ${mode === 'CORPORATIVO' && node.rango_salarial ? `<p class="salary-range">(${node.rango_salarial})</p>` : ''}
                        <p class="occupant-name">${node.nombres || 'Puesto Vacante'}</p>
                        ${mode === 'CORPORATIVO' && node.sueldo ? `<p class="salary-actual">S/ ${node.sueldo}</p>` : ''}
                        <div class="node-schedule">
                            <span class="material-symbols-outlined" style="font-size:12px">schedule</span>
                            ${node.horario || 'No definido'}
                        </div>
                        ${node.dotacion > 1 ? `<span class="dotacion-badge">x${node.dotacion}</span>` : ''}
                    </div>
                </div>
                ${node.children && node.children.length > 0 ? `
                    <div class="children-container">
                        <div class="children-container-line"></div>
                        <div class="children-row">
                            ${renderTreeNodes(node.children, level + 1)}
                        </div>
                    </div>
                ` : ''}
            </div>
        `).join('');
    };

    // Safe roles injection: escape backticks and dollar signs to avoid breaking the outer template literal
    const rolesJson = JSON.stringify(allRoles).replace(/`/g, '\\`').replace(/\$/g, '\\$');

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet">
    <style>
        :root { --primary: #6366f1; --slate-800: #1e293b; --slate-500: #64748b; --slate-400: #94a3b8; }
        body { font-family: 'Inter', sans-serif; background: #f8fafc; margin: 0; padding: 40px; color: var(--slate-800); }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 50px; }
        h1 { margin: 0; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em; }
        .date { color: var(--slate-500); font-size: 14px; font-weight: 700; }
        
        .tree-wrapper { display: flex; flex-direction: column; align-items: center; width: min-content; margin: 0 auto; }
        .tree-node-container { position: relative; padding: 32px 10px 0 10px; display: flex; flex-direction: column; align-items: center; }
        
        .tree-node-container::before, .tree-node-container::after {
            content: ''; position: absolute; top: 0; right: 50%; width: 50%; height: 2px; background: #cbd5e1;
        }
        .tree-node-container::after { right: auto; left: 50%; }
        .tree-node-container:only-child::before, .tree-node-container:only-child::after { display: none; }
        .tree-node-container:first-child::before { display: none; }
        .tree-node-container:last-child::after { display: none; }

        .tree-node-center-line { position: absolute; top: 0; left: 50%; width: 2px; height: 32px; background: #cbd5e1; transform: translateX(-50%); }
        
        .node-card { background: white; border: 2px solid #f1f5f9; border-radius: 16px; padding: 16px; width: 210px; display: flex; flex-direction: column; align-items: center; text-align: center; cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); position: relative; z-index: 10; }
        .node-card:hover { transform: translateY(-5px); box-shadow: 0 12px 20px -8px rgba(0, 0, 0, 0.1); border-color: var(--primary); }
        
        .node-icon { width: 32px; height: 32px; background: #f1f5f9; color: var(--slate-500); border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; }
        .role-title { font-size: 10px; font-weight: 900; text-transform: uppercase; margin: 0 0 4px 0; }
        .salary-range { font-size: 8px; font-weight: 600; color: var(--primary); margin: 0 0 4px 0; }
        .occupant-name { font-size: 11px; font-weight: 700; color: #475569; border-top: 1px solid #f1f5f9; padding-top: 6px; margin-top: 4px; }
        .salary-actual { font-size: 11px; font-weight: 900; color: #16a34a; margin: 4px 0 0 0; }
        .node-schedule { font-size: 10px; color: var(--slate-400); margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 4px; }
        .dotacion-badge { position: absolute; top: -8px; right: -8px; background: var(--slate-800); color: white; font-size: 10px; font-weight: 900; padding: 4px 8px; border-radius: 999px; border: 2px solid white; }
        
        .children-container { position: relative; display: flex; flex-direction: column; align-items: center; width: 100%; }
        .children-container-line { width: 2px; height: 32px; background: #cbd5e1; }
        .children-row { display: flex; justify-content: center; position: relative; width: 100%; }
        
        #details-modal { position: fixed; top: 0; right: 0; width: 450px; height: 100%; background: white; box-shadow: -10px 0 30px rgba(0,0,0,0.1); z-index: 1000; transform: translateX(100%); transition: transform 0.3s ease-out; overflow-y: auto; padding: 40px; }
        #details-modal.open { transform: translateX(0); }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); z-index: 999; display: none; }
        .modal-overlay.open { display: block; }
        .close-btn { position: absolute; top: 20px; right: 20px; cursor: pointer; background: #f1f5f9; border: none; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        
        .section-title { font-size: 11px; font-weight: 900; color: var(--primary); text-transform: uppercase; margin: 24px 0 10px 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; letter-spacing: 0.05em; }
        .detail-text { font-size: 13px; line-height: 1.6; color: #475569; background: #f8fafc; padding: 12px; border-radius: 12px; }
        ul { padding-left: 18px; margin: 0; }
        li { margin-bottom: 6px; font-size: 13px; color: #475569; }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>${title}</h1>
            <div class="date">Exportado el: ${date}</div>
        </div>
        <div style="font-weight:900; color:var(--primary)">SISTEMA ERP</div>
    </div>

    <div class="tree-wrapper">
        ${renderTreeNodes(tree, 0)}
    </div>

    <div id="modal-overlay" class="modal-overlay" onclick="closeModal()"></div>
    <div id="details-modal">
        <button class="close-btn" onclick="closeModal()">
            <span class="material-symbols-outlined">close</span>
        </button>
        <div id="modal-content"></div>
    </div>

    <script>
        // Inyectamos el JSON como una cadena de texto simple para evitar problemas con backticks en el compilador
        const rolesDataRaw = '${rolesJson.replace(/'/g, "\\'")}';
        const roles = JSON.parse(rolesDataRaw);
        
        function showDetails(roleId) {
            const role = roles.find(function(r) { return r.id === roleId; });
            if (!role) return;
            
            const subordinates = roles.filter(function(r) { return r.parent_id === roleId; });
            
            let content = '<h2 style="font-size: 24px; font-weight: 900; margin: 0; line-height: 1.1;">' + role.nombre_cargo + '</h2>' +
                '<p style="color: var(--slate-500); font-weight: 700; margin: 8px 0 24px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em;">' + (role.area || 'Sin Área') + '</p>' +
                
                '<div class="section-title">Propósito del Cargo</div>' +
                '<div class="detail-text">' + (role.proposito || 'No definido') + '</div>' +
                
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 20px;">' +
                    '<div style="background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #f1f5f9;">' +
                        '<div style="font-size: 10px; font-weight: 900; color: var(--slate-400); text-transform: uppercase;">Reporta a:</div>' +
                        '<div style="font-weight: 700; font-size: 13px;">' + (role.reporta_a || 'Máximo Cargo') + '</div>' +
                    '</div>' +
                    '<div style="background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #f1f5f9;">' +
                        '<div style="font-size: 10px; font-weight: 900; color: var(--slate-400); text-transform: uppercase;">Supervisa a:</div>' +
                        '<div style="font-weight: 700; font-size: 13px;">' + subordinates.length + ' puestos</div>' +
                    '</div>' +
                '</div>';

            const categories = [
                { id: 'FUNCION_MAIN', label: 'Funciones Principales' },
                { id: 'FUNCION_SEC', label: 'Funciones Secundarias' },
                { id: 'PROCESO', label: 'Procesos' },
                { id: 'KPI', label: 'KPIs' },
                { id: 'RELACION', label: 'Relaciones' },
                { id: 'COMP_TEC', label: 'Competencias Técnicas' },
                { id: 'COMP_BLANDA', label: 'Competencias Blandas' },
                { id: 'HERRAMIENTA', label: 'Herramientas' },
                { id: 'CONDICION', label: 'Alcances y Condiciones' }
            ];

            categories.forEach(function(cat) {
                const items = (role.detalles_rol || []).filter(function(d) { return d.categoria === cat.id; });
                if (items.length > 0) {
                    content += '<div class="section-title">' + cat.label + '</div><ul>';
                    items.forEach(function(item) {
                        content += '<li>' + item.descripcion + '</li>';
                    });
                    content += '</ul>';
                }
            });

            document.getElementById('modal-content').innerHTML = content;
            document.getElementById('details-modal').classList.add('open');
            document.getElementById('modal-overlay').classList.add('open');
        }

        function closeModal() {
            document.getElementById('details-modal').classList.remove('open');
            document.getElementById('modal-overlay').classList.remove('open');
        }
    </script>
</body>
</html>`;
}
