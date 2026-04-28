import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
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

    const [isSaving, setIsSaving] = useState(false);
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [deleteConfirmStep, setDeleteConfirmStep] = useState<0 | 1 | 2>(0);
    const [roleToDelete, setRoleToDelete] = useState<string | null>(null);
    const [activePath, setActivePath] = useState<string[]>([]);

    const containerRef = useRef<HTMLDivElement>(null);
    const treeWrapperRef = useRef<HTMLDivElement>(null);

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

    const handleSaveRole = async (roleData: Partial<Role>) => {
        if (isSaving) return;

        setIsSaving(true);
        try {
            const subordinates = roles.filter(r => r.parent_id === roleData.id && roleData.id);
            const supervisaText = subordinates.map(s => s.nombre_cargo).join(', ');

            const roleToSave = {
                ...roleData,
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

    // Pre-calculate which area labels should be visible to avoid mutation issues during render
    const allowedAreaLabels = useMemo(() => {
        const allowed = new Set<string>();
        const levelAreaSeen = new Map<number, Set<string>>();

        const traverse = (nodes: any[], parentLevel: number) => {
            nodes.forEach(node => {
                const nodeJ = Number(node.jerarquia) || (parentLevel + 1);
                
                if (node.children?.length > 0) {
                    const sortedChildren = [...node.children].sort((a, b) => (Number(a.jerarquia) || 0) - (Number(b.jerarquia) || 0));
                    const areasFound: string[] = [];
                    let currentArea = '';
                    sortedChildren.forEach((child: any) => {
                        const normArea = (child.area || 'Sin área').trim();
                        if (normArea !== currentArea) {
                            areasFound.push(normArea);
                            currentArea = normArea;
                        }
                    });

                    areasFound.forEach(areaName => {
                        const cleanArea = areaName.trim();
                        const isGerencia = cleanArea.toUpperCase() === 'GERENCIA' || cleanArea.toUpperCase() === 'GERENCIA GENERAL';
                        if (isGerencia || cleanArea === '' || cleanArea === 'Sin área') return;

                        // NEW LOGIC: Only show if NONE of the children in this area group have children of their own IN THE SAME AREA
                        // This pushes the label to the bottom-most level of the area branch
                        const childrenInThisArea = sortedChildren.filter(c => (c.area || 'Sin área').trim() === cleanArea);
                        const hasSubAreaChildren = childrenInThisArea.some(c => 
                            c.children?.some((gc: any) => (gc.area || 'Sin área').trim() === cleanArea)
                        );

                        if (hasSubAreaChildren) return;

                        // Estimate child level
                        const firstChildInArea = childrenInThisArea[0];
                        const childLevel = Number(firstChildInArea?.jerarquia) || (nodeJ + 1);

                        if (!levelAreaSeen.has(childLevel)) levelAreaSeen.set(childLevel, new Set());
                        if (!levelAreaSeen.get(childLevel)!.has(cleanArea)) {
                            levelAreaSeen.get(childLevel)!.add(cleanArea);
                            allowed.add(`${node.id}-${cleanArea}-${childLevel}`);
                        }
                    });

                    traverse(node.children, nodeJ);
                }
            });
        };

        traverse(roleTree, 0);
        return allowed;
    }, [roleTree]);

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
                    <div className="tree-wrapper" ref={treeWrapperRef} style={{ position: 'relative' }}>
                        <FunctionalLines roles={roles} wrapperRef={treeWrapperRef} />
                        {roleTree.map(root => (
                            <TreeNode 
                                key={root.id} 
                                node={root} 
                                viewMode={viewMode}
                                activePath={activePath}
                                onSelect={handleNodeSelect}
                                onOpenDetails={handleNodeOpenDetails}
                                level={0}
                                parentJerarquia={0}
                                allowedAreaLabels={allowedAreaLabels}
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
                            initialRole={editingRole || {}}
                            roles={roles}
                            onSave={handleSaveRole}
                            onCancel={() => { setIsFormOpen(false); setEditingRole(null); }}
                            isSaving={isSaving}
                            personalStaff={personalStaff}
                        />
                    </div>
                </div>,
                document.body
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

const TreeNode = React.memo(({ node, viewMode, onSelect, onOpenDetails, activePath, level, parentJerarquia, allowedAreaLabels, parentMeasuredLevelStep, isStaff }: { node: any, viewMode: ViewMode, onSelect: (role: Role) => void, onOpenDetails: (role: Role) => void, activePath: string[], level: number, parentJerarquia: number, allowedAreaLabels: Set<string>, parentMeasuredLevelStep?: number, isStaff?: boolean }) => {
    const isActive = activePath.includes(node.id);
    const isSelected = activePath[0] === node.id;
    const activeChildId = node.children?.find((c: any) => activePath.includes(c.id))?.id;
    const hasActiveChild = !!activeChildId;

    // Hierarchy Colors
    const borderColor = level === 0 ? '#B68D40' : level === 1 ? '#001B36' : '#00162B';

    // Stagger delay based on distance from root in the active path
    const pathIndex = activePath.indexOf(node.id);
    const animDelay = pathIndex !== -1 ? (activePath.length - 1 - pathIndex) * 0.3 : 0;

    const rowRef = React.useRef<HTMLDivElement>(null);
    const [linePositions, setLinePositions] = React.useState<{
        centers: number[], wrapperEdges: number[], dropX: number, rowHeight: number, cardBottom: number
    }>({ centers: [], wrapperEdges: [], dropX: 0, rowHeight: 0, cardBottom: 0 });

    const childCount = node.children?.length || 0;

    // nodeJerarquia declared here so it's available inside the layout effect
    const nodeJerarquia = Number(node.jerarquia) || (level + 1);

    // Stable sorted children — needed both in the layout effect and in JSX
    const sortedChildren = React.useMemo(() => {
        if (!node.children || node.children.length === 0) return [] as any[];
        return [...node.children].sort((a: any, b: any) => {
            const aArea = (a.area || 'Sin área').trim().toLowerCase();
            const bArea = (b.area || 'Sin área').trim().toLowerCase();
            if (aArea !== bArea) return aArea.localeCompare(bArea, 'es');
            return (Number(a.jerarquia) || 0) - (Number(b.jerarquia) || 0);
        });
    }, [node.children]);

    // STAFF children branch horizontally next to this node; regular children hang below.
    const staffChildren = React.useMemo(() =>
        sortedChildren.filter((c: any) => c.tipo_relacion === 'STAFF'),
        [sortedChildren]
    );
    const regularChildren = React.useMemo(() =>
        sortedChildren.filter((c: any) => c.tipo_relacion !== 'STAFF'),
        [sortedChildren]
    );

    // Separate active-child detection so STAFF children don't pollute the regular-children pulse logic
    const hasActiveRegularChild = regularChildren.some((c: any) => activePath.includes(c.id));
    const hasActiveStaffChild   = staffChildren.some((c: any) => activePath.includes(c.id));

    // Measured level step: calibrated from actual rendered card heights of gap=1 children.
    // When a child skips hierarchy levels (gap>1), this ensures it aligns with the deepest
    // same-level nodes in sibling branches, regardless of the static card-height assumption.
    const [measuredLevelStep, setMeasuredLevelStep] = React.useState<number | null>(null);

    React.useLayoutEffect(() => {
        const row = rowRef.current;
        if (!row || regularChildren.length === 0) return;

        const updatePositions = () => {
            const wrappers = Array.from(row.querySelectorAll(':scope > .horizontal-connector-wrapper'));
            const rowRect = row.getBoundingClientRect();
            if (rowRect.width === 0) return;

            let cardB = 0;
            const wrapperEdges: number[] = [];
            const centers = wrappers.map((w) => {
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

            // If any regular child skips a hierarchy level, measure the gap=1 siblings' card heights
            // so the gap>1 children land at the same absolute Y as their cousins one level down.
            const hasGapGt1 = regularChildren.some(
                (c: any) => Math.max(1, (Number(c.jerarquia) || 0) - nodeJerarquia) > 1
            );
            if (hasGapGt1) {
                const gap1Heights: number[] = [];
                wrappers.forEach((w, i) => {
                    if (i >= regularChildren.length) return;
                    const child = regularChildren[i];
                    const gap = Math.max(1, (Number(child.jerarquia) || 0) - nodeJerarquia);
                    if (gap === 1) {
                        const card = w.querySelector('.node-card');
                        if (card) {
                            const ch = card.getBoundingClientRect().height;
                            if (ch > 10) gap1Heights.push(ch);
                        }
                    }
                });
                if (gap1Heights.length > 0) {
                    const avg = gap1Heights.reduce((a, b) => a + b, 0) / gap1Heights.length;
                    const newStep = Math.round(avg) + 96; // CARD_H + children-container(64) + base-node-padding(32)
                    setMeasuredLevelStep(prev => (prev === null || Math.abs(prev - newStep) > 1) ? newStep : prev);
                }
            }
        };

        updatePositions();
        const timer = setTimeout(updatePositions, 200);
        return () => clearTimeout(timer);
    }, [regularChildren, activePath, viewMode, nodeJerarquia]);

    const jerarquiaGap = Math.max(1, nodeJerarquia - parentJerarquia);
    const LEVEL_STEP = viewMode === 'CORPORATIVO' ? 245 : 222;
    // Use the step measured by the parent (from its gap=1 children) when available;
    // this makes gap>1 nodes align with their same-jerarquía cousins in other branches.
    const effectiveLevelStep = parentMeasuredLevelStep ?? LEVEL_STEP;
    const extraPadding = (jerarquiaGap - 1) * effectiveLevelStep;

    // ── STAFF render ─────────────────────────────────────────────────────────
    // When a node has tipo_relacion = 'STAFF' the parent renders it with isStaff=true.
    // It appears to the right of its parent card connected by a horizontal solid line,
    // without the vertical center-line used by normal hierarchy nodes.
    if (isStaff) {
        return (
            <div className="staff-node-outer">
                <div className={`staff-h-connector ${isActive ? 'active' : ''}`}>
                    {isActive && <div className="pulse-light-h full to-left" style={{ animationDelay: `${animDelay}s` }} />}
                </div>
                <div className="staff-node-inner">
                    <div
                        className={`node-card staff-card ${isSelected ? 'active-card' : isActive ? 'active-path-card' : ''}`}
                        style={{ borderColor: isSelected ? borderColor : `${borderColor}1A` }}
                        data-role-id={node.id}
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
                        {isSelected && <div className="click-pulse-halo"></div>}
                    </div>
                    {/* Staff node's own regular children, if any */}
                    {regularChildren.length > 0 && (
                        <div className="children-container">
                            <div className="children-container-line" />
                            <div className="children-row" ref={rowRef}>
                                {regularChildren.map((child: any) => (
                                    <div key={child.id} className="horizontal-connector-wrapper">
                                        <TreeNode
                                            node={child}
                                            viewMode={viewMode}
                                            onSelect={onSelect}
                                            onOpenDetails={onOpenDetails}
                                            activePath={activePath}
                                            level={level + 1}
                                            parentJerarquia={nodeJerarquia}
                                            allowedAreaLabels={allowedAreaLabels}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div
            className={`tree-node-container ${isActive ? 'active-branch' : ''}`}
            style={{ paddingTop: `${32 + extraPadding}px` }}
        >
            {/* Vertical connector to parent/sibling-bar */}
            <div
                className={`tree-node-center-line ${isActive ? 'active' : ''}`}
                style={{ height: `${32 + extraPadding}px` }}
            >
                {isActive && activePath[activePath.length - 1] !== node.id && (
                    <div className="pulse-light-v" style={{ animationDelay: `${animDelay}s` }}></div>
                )}
            </div>

            {/* Node card — centered alone in the column, not displaced by staff siblings */}
            <div
                className={`node-card ${isSelected ? 'active-card' : isActive ? 'active-path-card' : ''}`}
                style={{ borderColor: isSelected ? borderColor : `${borderColor}1A` }}
                data-role-id={node.id}
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
                {isSelected && <div className="click-pulse-halo"></div>}
            </div>

            {/* STAFF children branch off from the vertical spine below the card */}
            {staffChildren.length > 0 && (
                <div className="staff-branch-zone">
                    <div className={`staff-branch-vline ${hasActiveRegularChild ? 'active' : ''}`}>
                        {hasActiveStaffChild && (
                            <div className="pulse-light-v up" style={{ animationDelay: `${animDelay}s` }} />
                        )}
                        {hasActiveRegularChild && (
                            <div className="pulse-light-v" style={{ animationDelay: `${animDelay + 0.1}s` }} />
                        )}
                    </div>
                    <div className="staff-branch-items">
                        {staffChildren.map((child: any) => (
                            <TreeNode
                                key={child.id}
                                node={child}
                                viewMode={viewMode}
                                onSelect={onSelect}
                                onOpenDetails={onOpenDetails}
                                activePath={activePath}
                                level={level + 1}
                                parentJerarquia={nodeJerarquia}
                                allowedAreaLabels={allowedAreaLabels}
                                isStaff={true}
                            />
                        ))}
                    </div>
                </div>
            )}
            
            {regularChildren.length > 0 && (() => {
                // Only regular (non-STAFF) children hang below in the tree row.

                const activeIdx = regularChildren.findIndex((c: any) => activePath.includes(c.id));
                const midIdx = (regularChildren.length - 1) / 2;

                const areas: any[] = [];
                let currentArea = '';
                regularChildren.forEach((child: any, idx: number) => {
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
                if (hasActiveRegularChild && activeIdx >= 0 && linePositions.centers.length > 0) {
                    const activeCenter = linePositions.centers[activeIdx];
                    const dropCenter = linePositions.dropX; // Real vertical drop position
                    if (activeCenter !== undefined && dropCenter !== undefined) {
                        const left = Math.min(activeCenter, dropCenter);
                        const right = Math.max(activeCenter, dropCenter);
                        activeLine = { left, width: right - left, show: true };
                    }
                }

                return (
                    <div className={`children-container ${hasActiveRegularChild ? 'active-path' : ''}`}>
                        <div className="children-container-line">
                            {hasActiveRegularChild && <div className="pulse-light-v" style={{ animationDelay: `${animDelay + 0.2}s` }}></div>}
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
                                        const nextAreaStartIdx = aIdx + 1 < areas.length ? areas[aIdx + 1].startIdx : regularChildren.length;
                                        const groupEndIdx = nextAreaStartIdx - 1;

                                        const childJerarquia = Number(regularChildren[areaInfo.startIdx].jerarquia) || (nodeJerarquia + 1);
                                        const cleanAreaName = (areaInfo.name || '').trim();

                                        const shouldShowLabel = allowedAreaLabels.has(`${node.id}-${cleanAreaName}-${childJerarquia}`);

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
                                                {shouldShowLabel && (
                                                    <div
                                                        className="flat-area-label"
                                                        style={{
                                                            left: `${labelCenterX}px`,
                                                            top: `${linePositions.cardBottom + 40}px`,
                                                            transform: 'translateX(-50%)'
                                                        }}
                                                    >{areaInfo.name}</div>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </>
                            )}
                            {regularChildren.map((child: any) => {
                                return (
                                    <div key={child.id} className="horizontal-connector-wrapper">
                                        <TreeNode
                                            node={child}
                                            viewMode={viewMode}
                                            onSelect={onSelect}
                                            onOpenDetails={onOpenDetails}
                                            activePath={activePath}
                                            level={level + 1}
                                            parentJerarquia={nodeJerarquia}
                                            allowedAreaLabels={allowedAreaLabels}
                                            parentMeasuredLevelStep={measuredLevelStep ?? undefined}
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
        <>
            {/* Sticky header — always visible while scrolling so el rol queda identificado */}
            <div className="role-details-header">
                <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(74, 144, 226, 0.12)', color: '#4A90E2' }}>
                                <Icon name={getRoleIcon(role.nombre_cargo)} className="!text-lg" />
                            </div>
                            <p className="uppercase text-[10px] font-black tracking-[0.18em]" style={{ color: '#366480' }}>{role.area || 'Sin área'}</p>
                        </div>
                        <h2 className="text-2xl font-black leading-tight" style={{ color: '#2c3434' }}>{role.nombre_cargo}</h2>
                        {role.nombres && <p className="text-sm font-semibold mt-1" style={{ color: '#366480' }}>{role.nombres}</p>}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                        <button className="button-icon edit" title="Editar Puesto" onClick={onEdit}><Icon name="edit" /></button>
                        <button
                            className={`button-icon delete ${subordinates.length > 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                            title={subordinates.length > 0 ? "Estructura Protegida: Reasigne dependientes antes de poder eliminar" : "Eliminar Puesto"}
                            onClick={onDelete}
                            disabled={subordinates.length > 0}
                        >
                            <Icon name="delete" />
                        </button>
                        <button className="button-icon close" onClick={onClose}><Icon name="close" /></button>
                    </div>
                </div>
            </div>

            {/* Scrollable body */}
            <div className="role-details-body custom-scrollbar">
                <div className="space-y-5">
                    <section>
                        <h4 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider mb-2" style={{ color: '#4A90E2' }}><Icon name="target" className="!text-sm" /> Propósito</h4>
                        <p className="text-sm leading-relaxed p-3.5 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.55)', backdropFilter: 'blur(10px)', border: '1px solid rgba(196, 208, 210, 0.35)', color: '#2c3434' }}>{role.proposito || 'Sin propósito definido.'}</p>
                    </section>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.55)', backdropFilter: 'blur(10px)', border: '1px solid rgba(196, 208, 210, 0.35)' }}>
                            <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#8aa0a8' }}>Reporta a:</span>
                            <p className="text-sm font-semibold mt-1" style={{ color: '#2c3434' }}>{role.reporta_a || 'Gerente General (Máximo Cargo)'}</p>
                        </div>
                        <div className="p-3 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.55)', backdropFilter: 'blur(10px)', border: '1px solid rgba(196, 208, 210, 0.35)' }}>
                            <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#8aa0a8' }}>Supervisa a ({subordinates.length}):</span>
                            <div className="flex flex-wrap gap-1 mt-1 max-h-[80px] overflow-y-auto custom-scrollbar pr-1">
                                {subordinates.length > 0 ? subordinates.map(s => (
                                    <span key={s.id} className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(196, 208, 210, 0.5)', color: '#366480' }}>
                                        {s.nombre_cargo}
                                    </span>
                                )) : (
                                    <p className="text-sm font-semibold" style={{ color: '#2c3434' }}>Nadie directamente</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {CATEGORIES.map(cat => {
                        const items = role.detalles_rol?.filter(d => d.categoria === cat.id) || [];
                        if (items.length === 0) return null;
                        return (
                            <section key={cat.id}>
                                <h4 className="text-[11px] font-black uppercase tracking-wider mb-2 pb-1.5" style={{ color: '#4A90E2', borderBottom: '1.5px solid rgba(74, 144, 226, 0.18)' }}>{cat.label}</h4>
                                <ul className="list-disc pl-5 text-sm space-y-1.5" style={{ color: '#2c3434' }}>
                                    {items.map((item, i) => <li key={i}>{item.descripcion}</li>)}
                                </ul>
                            </section>
                        );
                    })}
                </div>
            </div>
        </>
    );
}

function FunctionalLines({ roles, wrapperRef }: { roles: Role[], wrapperRef: React.RefObject<HTMLDivElement> }) {
    const [paths, setPaths] = useState<string[]>([]);

    const updateLines = () => {
        if (!wrapperRef.current) return;
        const wrapper = wrapperRef.current;
        const wrapperRect = wrapper.getBoundingClientRect();
        if (wrapperRect.width === 0) return;

        const CLEARANCE = 20;

        // Snapshot all card rects once (avoids repeated reflow calls)
        const cardEls = Array.from(wrapper.querySelectorAll('[data-role-id]')) as HTMLElement[];
        const cardBoxes = cardEls.map(el => {
            const r = el.getBoundingClientRect();
            return {
                id:     el.dataset.roleId || '',
                left:   r.left   - wrapperRect.left,
                right:  r.right  - wrapperRect.left,
                top:    r.top    - wrapperRect.top,
                bottom: r.bottom - wrapperRect.top,
            };
        });

        // True if a vertical segment at x=vx crossing [yLow,yHigh] intersects a card (excludes skipIds)
        const isVBlocked = (vx: number, yLow: number, yHigh: number, skipIds: string[]): boolean =>
            cardBoxes.some(b => {
                if (skipIds.includes(b.id)) return false;
                return (b.left - CLEARANCE) < vx &&
                       vx < (b.right + CLEARANCE) &&
                       (b.top  - CLEARANCE) < yHigh &&
                       (b.bottom + CLEARANCE) > yLow;
            });

        const treeLeft  = cardBoxes.length ? Math.min(...cardBoxes.map(b => b.left))  - 60 : 0;
        const treeRight = cardBoxes.length ? Math.max(...cardBoxes.map(b => b.right)) + 60 : 2000;

        const newPaths: string[] = [];

        roles.forEach(role => {
            if (!role.relacion_funcional?.length) return;
            const srcEl = wrapper.querySelector(`[data-role-id="${role.id}"]`) as HTMLElement | null;
            if (!srcEl) return;
            const src = srcEl.getBoundingClientRect();
            const sx = {
                left:   src.left   - wrapperRect.left,
                right:  src.right  - wrapperRect.left,
                bottom: src.bottom - wrapperRect.top,
                midX:  (src.left   + src.right)  / 2 - wrapperRect.left,
                midY:  (src.top    + src.bottom) / 2 - wrapperRect.top,
            };

            role.relacion_funcional.forEach(targetId => {
                const tgtEl = wrapper.querySelector(`[data-role-id="${targetId}"]`) as HTMLElement | null;
                if (!tgtEl) return;
                const tgt = tgtEl.getBoundingClientRect();
                const tx = {
                    left:  tgt.left  - wrapperRect.left,
                    right: tgt.right - wrapperRect.left,
                    midX:  (tgt.left  + tgt.right)  / 2 - wrapperRect.left,
                    midY:  (tgt.top   + tgt.bottom) / 2 - wrapperRect.top,
                };

                const skipIds = [role.id!, targetId];

                // Exit point depends on where the hierarchy connector enters the source card:
                //   STAFF nodes  → hierarchy enters from LEFT (staff-h-connector) → exit from RIGHT
                //   Regular nodes → hierarchy enters from TOP (center-line)       → exit from BOTTOM
                const isStaffSrc = role.tipo_relacion === 'STAFF';
                const x1 = isStaffSrc ? sx.right  : sx.midX;
                const y1 = isStaffSrc ? sx.midY   : sx.bottom;

                // Target always entered from LEFT or RIGHT side at mid-height (never from below)
                const x2 = tx.midX >= sx.midX ? tx.left : tx.right;
                const y2 = tx.midY;

                if (isStaffSrc) {
                    // Z-path: exit right → small rightward gap → vertical to target level → horizontal to target side
                    const pivot = x1 + 40;
                    newPaths.push(`M ${x1} ${y1} H ${pivot} V ${y2} H ${x2}`);
                } else {
                    // L-path: exit bottom → vertical to target level → horizontal to target side
                    newPaths.push(`M ${x1} ${y1} V ${y2} H ${x2}`);
                }
            });
        });

        setPaths(newPaths);
    };

    useLayoutEffect(() => {
        const t1 = setTimeout(updateLines, 800);
        const t2 = setTimeout(updateLines, 1600);
        const interval = setInterval(updateLines, 2000);
        window.addEventListener('resize', updateLines);
        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearInterval(interval);
            window.removeEventListener('resize', updateLines);
        };
    }, [roles]);

    return (
        <svg className="functional-lines-overlay" style={{ pointerEvents: 'none' }}>
            <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#b6dbf2" />
                </marker>
            </defs>
            {paths.map((d, i) => (
                <path
                    key={i}
                    d={d}
                    className="functional-line"
                    markerEnd="url(#arrowhead)"
                />
            ))}
        </svg>
    );
}

function MultiSelectRoles({ selectedIds, roles, onChange }: { selectedIds: string[], roles: Role[], onChange: (ids: string[]) => void }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredRoles = roles.filter(r => 
        r.nombre_cargo.toLowerCase().includes(search.toLowerCase()) || 
        (r.area && r.area.toLowerCase().includes(search.toLowerCase()))
    );

    const toggleRole = (id: string) => {
        const newIds = selectedIds.includes(id) 
            ? selectedIds.filter(i => i !== id) 
            : [...selectedIds, id];
        onChange(newIds);
    };

    return (
        <div className="multi-select-container" ref={containerRef}>
            <div className="multi-select-trigger" onClick={() => setIsOpen(!isOpen)}>
                <div className="flex flex-wrap gap-1">
                    {selectedIds.length > 0 ? (
                        selectedIds.map(id => {
                            const r = roles.find(x => x.id === id);
                            return (
                                <span key={id} className="multi-select-badge">
                                    {r?.nombre_cargo || 'Cargando...'}
                                </span>
                            );
                        })
                    ) : (
                        <span className="text-slate-400 italic">Ninguna relación funcional</span>
                    )}
                </div>
                <Icon name={isOpen ? "expand_less" : "expand_more"} />
            </div>

            {isOpen && (
                <div className="multi-select-dropdown custom-scrollbar shadow-2xl border-indigo-100">
                    <div className="multi-select-search">
                        <input 
                            autoFocus
                            placeholder="Buscar puesto o área..." 
                            value={search} 
                            onChange={e => setSearch(e.target.value)}
                            onClick={e => e.stopPropagation()}
                        />
                    </div>
                    {filteredRoles.map(r => {
                        const isSel = selectedIds.includes(r.id!);
                        return (
                            <div 
                                key={r.id} 
                                className={`multi-select-option ${isSel ? 'selected' : ''}`}
                                onClick={() => toggleRole(r.id!)}
                            >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSel ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                                    {isSel && <Icon name="check" className="!text-[10px] text-white" />}
                                </div>
                                <div className="min-w-0">
                                    <p className="font-bold truncate">{r.nombre_cargo}</p>
                                    <p className="text-[10px] uppercase opacity-60 truncate">{r.area}</p>
                                </div>
                            </div>
                        );
                    })}
                    {filteredRoles.length === 0 && <p className="p-4 text-center text-xs text-slate-400">No se encontraron puestos</p>}
                </div>
            )}
        </div>
    );
}

function RoleForm({ initialRole, roles, onSave, onCancel, isSaving, personalStaff }: {
    initialRole: Partial<Role>,
    roles: Role[],
    onSave: (roleData: Partial<Role>) => Promise<void>,
    onCancel: () => void,
    isSaving: boolean,
    personalStaff: any[]
}) {
    // Local state — keystrokes stay inside this component and don't re-render the tree
    const [role, setRole] = useState<Partial<Role>>(initialRole);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [bulkTargetCat, setBulkTargetCat] = useState<string | null>(null);

    // Salary fields get their own local state so typing doesn't re-render the full form.
    // They sync to `role` on blur and are merged into the final payload on submit.
    const [rangeMin, setRangeMin] = useState(() => {
        const parts = (initialRole.rango_salarial || '').split('-');
        return parts[0]?.trim() || '';
    });
    const [rangeMax, setRangeMax] = useState(() => {
        const parts = (initialRole.rango_salarial || '').split('-');
        return parts[1]?.trim() || '';
    });
    const [sueldoStr, setSueldoStr] = useState(() =>
        initialRole.sueldo != null && initialRole.sueldo !== 0 ? String(initialRole.sueldo) : ''
    );

    const subordinates = roles.filter(r => r.parent_id === role.id && role.id);
    const parentRole = roles.find(r => r.id === role.parent_id);

    // Calculate initial offset based on current jerarquia and parent jerarquia
    const [offset, setOffset] = useState(() => {
        const initParent = roles.find(r => r.id === initialRole.parent_id);
        const currentJ = Number(initialRole.jerarquia) || 1;
        const parentJ = Number(initParent?.jerarquia) || 0;
        return Math.max(1, currentJ - parentJ);
    });

    const [blockToDelete, setBlockToDelete] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const finalRole: Partial<Role> = {
            ...role,
            rango_salarial: `${rangeMin} - ${rangeMax}`,
            sueldo: parseFloat(sueldoStr) || 0,
        };
        await onSave(finalRole);
    };

    const flushSalaryToRole = () => {
        setRole(prev => ({
            ...prev,
            rango_salarial: `${rangeMin} - ${rangeMax}`,
            sueldo: parseFloat(sueldoStr) || 0,
        }));
    };

    const confirmDeleteBlock = () => {
        if (!blockToDelete) return;
        const details = (role.detalles_rol || []).filter(d => d.categoria !== blockToDelete);
        setRole({ ...role, detalles_rol: details });
        setBlockToDelete(null);
    };

    const handleConfirmBulk = (text: string) => {
        if (!bulkTargetCat) return;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const currentDetails = role.detalles_rol || [];
        const newDetails = lines.map(line => ({ categoria: bulkTargetCat as any, descripcion: line }));
        setRole({ ...role, detalles_rol: [...currentDetails, ...newDetails] });
        setIsBulkModalOpen(false);
        setBulkTargetCat(null);
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
        setBulkTargetCat(catId);
        setIsBulkModalOpen(true);
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

    // isOutOfRange derived from local salary state — updates in real-time without triggering a full re-render
    const minSal = parseFloat(rangeMin) || 0;
    const maxSal = parseFloat(rangeMax) || 0;
    const currentSal = parseFloat(sueldoStr) || 0;
    const isOutOfRange = (currentSal > 0) && (minSal > 0 || maxSal > 0) && (currentSal < minSal || currentSal > maxSal);

    return (
        <form onSubmit={handleSubmit} className="p-8">
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
                                    const parentJ = parent ? (Number(parent.jerarquia) || 1) : 0;
                                    setRole({ 
                                        ...role, 
                                        parent_id: pId || null,
                                        reporta_a: parent ? parent.nombre_cargo : 'Gerente General',
                                        jerarquia: parentJ + offset
                                    });
                                }}
                            >
                                <option value="">--- Máxima Jerarquía ---</option>
                                {roles.filter(r => r.id !== role.id).map(r => (
                                    <option key={r.id} value={r.id}>{r.nombre_cargo} ({r.area})</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Tipo de Relación con Superior</label>
                            <div className="flex gap-4 mt-1 p-3 bg-white rounded-2xl border border-slate-200">
                                <label className="flex items-center gap-2 cursor-pointer flex-1">
                                    <input
                                        type="radio"
                                        name="tipo_relacion"
                                        value="JERARQUICA"
                                        checked={role.tipo_relacion !== 'STAFF'}
                                        onChange={() => setRole({ ...role, tipo_relacion: 'JERARQUICA' })}
                                        className="accent-indigo-600"
                                    />
                                    <div>
                                        <p className="text-xs font-black text-slate-700">Jerárquica</p>
                                        <p className="text-[10px] text-slate-400">Posición vertical en el árbol</p>
                                    </div>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer flex-1">
                                    <input
                                        type="radio"
                                        name="tipo_relacion"
                                        value="STAFF"
                                        checked={role.tipo_relacion === 'STAFF'}
                                        onChange={() => setRole({ ...role, tipo_relacion: 'STAFF' })}
                                        className="accent-amber-500"
                                    />
                                    <div>
                                        <p className="text-xs font-black text-slate-700">Staff / Apoyo</p>
                                        <p className="text-[10px] text-slate-400">Rama horizontal al lado del superior</p>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Relaciones Funcionales (Línea Punteada)</label>
                            <MultiSelectRoles
                                selectedIds={role.relacion_funcional || []}
                                roles={roles.filter(r => r.id !== role.id)}
                                onChange={ids => setRole({ ...role, relacion_funcional: ids })}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="form-group">
                                <label title="Niveles de separación con el superior">Incremento Nivel</label>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="number"
                                        min="1"
                                        className="!py-2 !px-3"
                                        value={offset} 
                                        onChange={e => {
                                            const val = Math.max(1, parseInt(e.target.value) || 1);
                                            setOffset(val);
                                            const parentJ = parentRole ? (Number(parentRole.jerarquia) || 1) : 0;
                                            setRole({ ...role, jerarquia: parentJ + val });
                                        }}
                                    />
                                    <span className="text-[10px] font-bold text-slate-400">NIVELES</span>
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Jerarquía Absoluta</label>
                                <input 
                                    type="number"
                                    min="1"
                                    className="!py-2 !px-3 bg-indigo-50/50 border-indigo-100 font-bold text-indigo-700"
                                    value={role.jerarquia || ''} 
                                    onChange={e => {
                                        const newJ = parseInt(e.target.value) || 1;
                                        setRole({ ...role, jerarquia: newJ });
                                        const parentJ = parentRole ? (Number(parentRole.jerarquia) || 1) : 0;
                                        setOffset(Math.max(1, newJ - parentJ));
                                    }}
                                />
                            </div>
                        </div>
                        <div className="form-group mt-2">
                            <label>Dotación (Puestos)</label>
                            <input 
                                type="number"
                                min="1"
                                value={role.dotacion || 1} 
                                onChange={e => setRole({ ...role, dotacion: parseInt(e.target.value) || 1 })}
                            />
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
                                    value={rangeMin}
                                    onChange={e => setRangeMin(e.target.value)}
                                    onBlur={flushSalaryToRole}
                                />
                            </div>
                            <div className="form-group">
                                <label>Rango Max.</label>
                                <input
                                    type="number"
                                    onKeyDown={handleNoSignNumber}
                                    value={rangeMax}
                                    onChange={e => setRangeMax(e.target.value)}
                                    onBlur={flushSalaryToRole}
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
                                    value={sueldoStr}
                                    onChange={e => setSueldoStr(e.target.value)}
                                    onBlur={flushSalaryToRole}
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

            {isBulkModalOpen && (
                <BulkPasteModal
                    category={bulkTargetCat || ''}
                    onConfirm={handleConfirmBulk}
                    onCancel={() => { setIsBulkModalOpen(false); setBulkTargetCat(null); }}
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
    const title = `Organigrama - Modo ${mode}`;
    const date = new Date().toLocaleDateString();

    const LEVEL_STEP = mode === 'CORPORATIVO' ? 245 : 222;
    const getLevelColor = (lvl: number) => lvl === 0 ? '#B68D40' : lvl === 1 ? '#001B36' : '#00162B';

    // Mutually recursive: renderStaffNode calls renderTreeNodes for staff children's subtrees
    let renderStaffNode: (node: any, level: number, parentJ: number) => string;
    let renderTreeNodes: (nodes: any[], level: number, parentJerarquia: number) => string;

    renderStaffNode = (node: any, level: number, parentJ: number): string => {
        const nodeJ = Number(node.jerarquia) || level;
        const levelColor = getLevelColor(level);
        const childRegular = (node.children || []).filter((c: any) => c.tipo_relacion !== 'STAFF');
        return `
        <div class="staff-node-outer" data-node-id="${node.id}" data-tipo-relacion="STAFF">
            <div class="staff-h-connector"></div>
            <div class="staff-node-inner">
                <div class="node-card staff-card" data-node-id="${node.id}" data-level-color="${levelColor}" data-level="${level}" style="border-color: ${levelColor}1A;" onclick="selectNode(event,'${node.id}')" ondblclick="showDetails('${node.id}')">
                    <div class="node-icon"><span class="material-symbols-outlined">${getRoleIcon(node.nombre_cargo || '')}</span></div>
                    <div class="node-info">
                        <h3 class="role-title">${node.nombre_cargo}</h3>
                        ${mode === 'CORPORATIVO' && node.rango_salarial ? `<p class="salary-range">(${node.rango_salarial})</p>` : ''}
                        <p class="occupant-name">${node.nombres || 'Puesto Vacante'}</p>
                        ${mode === 'CORPORATIVO' && node.sueldo ? `<p class="salary-actual">S/ ${node.sueldo}</p>` : ''}
                        <div class="node-schedule"><span class="material-symbols-outlined" style="font-size:12px">schedule</span>${node.horario || 'No definido'}</div>
                        ${node.dotacion > 1 ? `<span class="dotacion-badge">x${node.dotacion}</span>` : ''}
                    </div>
                </div>
                ${childRegular.length > 0 ? `
                <div class="children-container" data-parent-id="${node.id}">
                    <div class="children-container-line"></div>
                    <div class="children-row">${renderTreeNodes(childRegular, level + 1, nodeJ)}</div>
                </div>` : ''}
            </div>
        </div>`;
    };

    renderTreeNodes = (nodes: any[], level: number, parentJerarquia: number): string => {
        const sorted = [...nodes].sort((a: any, b: any) => {
            const aArea = (a.area || 'Sin área').trim().toLowerCase();
            const bArea = (b.area || 'Sin área').trim().toLowerCase();
            if (aArea !== bArea) return aArea.localeCompare(bArea, 'es');
            return (Number(a.jerarquia) || 0) - (Number(b.jerarquia) || 0);
        });

        return sorted.map(node => {
            const nodeJ = Number(node.jerarquia) || (level + 1);
            const gap = Math.max(1, nodeJ - parentJerarquia);
            const extraPadding = (gap - 1) * LEVEL_STEP;
            const containerPadTop = level === 0 ? 0 : (32 + extraPadding);
            const lineHeight = 32 + extraPadding;
            const levelColor = getLevelColor(level);
            const childArea = (node.area || 'Sin área').trim();
            const isAreaLabelable = childArea !== '' && childArea.toLowerCase() !== 'sin área' && childArea.toUpperCase() !== 'GERENCIA' && childArea.toUpperCase() !== 'GERENCIA GENERAL';

            const staffChildren = (node.children || []).filter((c: any) => c.tipo_relacion === 'STAFF');
            const regularChildren = (node.children || []).filter((c: any) => c.tipo_relacion !== 'STAFF');

            const staffZoneHtml = staffChildren.length > 0 ? `
            <div class="staff-branch-zone">
                <div class="staff-branch-vline"></div>
                <div class="staff-branch-items">
                    ${staffChildren.map((c: any) => renderStaffNode(c, level + 1, nodeJ)).join('')}
                </div>
            </div>` : '';

            const regularChildrenHtml = regularChildren.length > 0 ? `
            <div class="children-container" data-parent-id="${node.id}">
                <div class="children-container-line"></div>
                <div class="children-row">
                    ${renderTreeNodes(regularChildren, level + 1, nodeJ)}
                </div>
            </div>` : '';

            return `
            <div class="tree-node-container" data-node-id="${node.id}" data-jerarquia="${nodeJ}" data-parent-jerarquia="${parentJerarquia}" data-parent-id="${node.parent_id || ''}" data-area="${childArea}" data-area-labelable="${isAreaLabelable ? '1' : '0'}" data-tipo-relacion="${node.tipo_relacion || 'JERARQUICA'}" style="padding-top: ${containerPadTop}px;">
                ${level > 0 ? `<div class="tree-node-center-line" style="height: ${lineHeight}px;"></div>` : ''}
                <div class="node-card" data-node-id="${node.id}" data-level-color="${levelColor}" data-level="${level}" style="border-color: ${levelColor}1A;" onclick="selectNode(event, '${node.id}')" ondblclick="showDetails('${node.id}')">
                    <div class="node-icon"><span class="material-symbols-outlined">${getRoleIcon(node.nombre_cargo || '')}</span></div>
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
                ${staffZoneHtml}
                ${regularChildrenHtml}
            </div>`;
        }).join('');
    };

    // Safe roles injection: escape backticks and dollar signs to avoid breaking the outer template literal
    const rolesJson = JSON.stringify(allRoles).replace(/`/g, '\\`').replace(/\$/g, '\\$');

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800;900&family=Inter:wght@400;500;700;900&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet">
    <style>
        :root {
            --primary: #4A90E2;
            --deep-azure: #366480;
            --slate-text: #2c3434;
            --muted: #8aa0a8;
            --line: #c4d0d2;
            --pastel-mint: rgba(214, 226, 222, 0.35);
            --pastel-lavender: rgba(214, 207, 224, 0.30);
            --glass-bg: rgba(255, 255, 255, 0.78);
            --glass-border: rgba(255, 255, 255, 0.55);
        }
        * { box-sizing: border-box; }
        body {
            font-family: 'Manrope', 'Inter', system-ui, sans-serif;
            margin: 0;
            padding: 40px;
            color: var(--slate-text);
            min-height: 100vh;
            letter-spacing: -0.01em;
            background:
                radial-gradient(circle at 12% 8%, rgba(196, 213, 215, 0.45) 0%, transparent 45%),
                radial-gradient(circle at 88% 92%, rgba(214, 207, 224, 0.40) 0%, transparent 50%),
                linear-gradient(135deg, #f3f6f5 0%, #eef2f3 50%, #ecedef 100%);
            background-attachment: fixed;
        }
        .header {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 40px;
            padding: 22px 28px;
            border-radius: 24px;
            background: rgba(255, 255, 255, 0.65);
            backdrop-filter: blur(18px) saturate(140%);
            -webkit-backdrop-filter: blur(18px) saturate(140%);
            border: 1px solid var(--glass-border);
            box-shadow: 0 10px 40px rgba(44, 52, 52, 0.06);
        }
        h1 { margin: 0; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em; font-size: 22px; color: var(--slate-text); }
        .date { color: var(--deep-azure); font-size: 13px; font-weight: 700; margin-top: 4px; }
        .brand { font-weight: 900; color: var(--primary); letter-spacing: 0.18em; font-size: 12px; text-transform: uppercase; }

        .canvas {
            padding: 60px 32px 80px 32px;
            border-radius: 28px;
            background: rgba(255, 255, 255, 0.55);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border: 1px solid var(--glass-border);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 10px 40px rgba(44, 52, 52, 0.05);
            overflow: auto;
        }

        .tree-wrapper { display: flex; flex-direction: column; align-items: center; width: min-content; margin: 0 auto; position: relative; }
        .tree-node-container { position: relative; padding: 32px 10px 0 10px; display: flex; flex-direction: column; align-items: center; }
        .tree-wrapper > .tree-node-container { padding-top: 0 !important; }
        .tree-wrapper > .tree-node-container > .tree-node-center-line { display: none !important; }

        .tree-node-center-line { position: absolute; top: 0; left: 50%; width: 2px; height: 32px; background: var(--line); transform: translateX(-50%); z-index: 5; }

        /* Horizontal sibling bar (drawn by JS) */
        .h-line-bar { position: absolute; top: 0; height: 2px; background: var(--line); z-index: 1; }
        .h-line-bar.active { background: var(--primary); box-shadow: 0 0 12px rgba(74, 144, 226, 0.45); z-index: 5; }

        /* Horizontal pulsing light segment */
        .pulse-light-h { position: absolute; top: 0; height: 2px; z-index: 20; pointer-events: none; }
        .pulse-light-h.full { left: 0; width: 100%; }
        .pulse-light-h::after {
            content: ''; position: absolute;
            width: 12px; height: 6px; background: white; border-radius: 999px;
            box-shadow: 0 0 10px #fff, 0 0 15px var(--primary);
            top: -2px; opacity: 0;
        }
        .pulse-light-h.to-right::after { animation: travelHRight 1.2s infinite linear; }
        .pulse-light-h.to-left::after  { animation: travelHLeft  1.2s infinite linear; }
        @keyframes travelHRight { 0% { left: 0%; opacity: 0; } 30% { opacity: 1; } 70% { opacity: 1; } 100% { left: 100%; opacity: 0; } }
        @keyframes travelHLeft  { 0% { left: 100%; opacity: 0; } 30% { opacity: 1; } 70% { opacity: 1; } 100% { left: 0%; opacity: 0; } }

        .node-card {
            background: rgba(255, 255, 255, 0.78);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border: 1.5px solid rgba(255, 255, 255, 0.7);
            border-radius: 18px;
            padding: 16px;
            width: 210px;
            display: flex; flex-direction: column; align-items: center; text-align: center;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 4px 14px rgba(44, 52, 52, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.8);
            position: relative; z-index: 10;
        }
        .node-card:hover {
            transform: translateY(-5px);
            background: rgba(255, 255, 255, 0.92);
            box-shadow: 0 14px 28px -8px rgba(74, 144, 226, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.9);
        }

        .node-icon { width: 32px; height: 32px; background: rgba(214, 226, 222, 0.55); color: var(--deep-azure); border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; }
        .role-title { font-size: 10px; font-weight: 900; text-transform: uppercase; margin: 0 0 4px 0; color: var(--slate-text); }
        .salary-range { font-size: 8px; font-weight: 600; color: var(--primary); margin: 0 0 4px 0; }
        .occupant-name { font-size: 11px; font-weight: 700; color: var(--deep-azure); border-top: 1px solid rgba(196, 208, 210, 0.4); padding-top: 6px; margin-top: 4px; }
        .salary-actual { font-size: 11px; font-weight: 900; color: #5b9b7a; margin: 4px 0 0 0; }
        .node-schedule { font-size: 10px; color: var(--muted); margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 4px; }
        .dotacion-badge { position: absolute; top: -8px; right: -8px; background: var(--slate-text); color: white; font-size: 10px; font-weight: 900; padding: 4px 8px; border-radius: 999px; border: 2px solid rgba(255, 255, 255, 0.9); box-shadow: 0 2px 8px rgba(44, 52, 52, 0.15); }

        .children-container { position: relative; padding-top: 64px; display: flex; flex-direction: column; align-items: center; width: 100%; }
        .children-container-line { position: absolute; top: 0; left: 50%; width: 2px; height: 64px; background: var(--line); transform: translateX(-50%); z-index: 5; transition: background 0.2s; }
        .children-row { display: flex; justify-content: center; position: relative; padding-bottom: 60px; }

        /* Active path highlighting */
        .tree-node-container.active-branch > .tree-node-center-line,
        .children-container.active-path > .children-container-line {
            background: var(--primary) !important;
            box-shadow: 0 0 12px rgba(74, 144, 226, 0.4);
        }
        .node-card.active-card {
            background: rgba(255, 255, 255, 0.95);
            box-shadow: 0 0 25px rgba(44, 52, 52, 0.10);
            transform: scale(1.05);
        }
        .node-card.active-path-card { background: rgba(255, 255, 255, 0.88); }
        .node-card.active-card .node-icon,
        .node-card.active-path-card .node-icon { background: var(--slate-text); color: white; }

        /* Pulsing halo around the selected card — usa el color del nivel
           (heredado del border-color inline del .node-card) */
        .click-pulse-halo {
            position: absolute; inset: -6px;
            border-radius: 22px;
            border: 2px solid currentColor;
            border-color: inherit;
            opacity: 0;
            pointer-events: none;
            animation: clickPulse 2s infinite;
        }
        @keyframes clickPulse {
            0%   { transform: scale(0.95); opacity: 0; }
            50%  { opacity: 0.5; }
            100% { transform: scale(1.05); opacity: 0; }
        }

        /* Vertical pulsing light along the active connector */
        .pulse-light-v {
            position: absolute;
            width: 6px; height: 12px;
            background: white;
            left: -2px;
            border-radius: 999px;
            box-shadow: 0 0 10px #fff, 0 0 15px var(--primary);
            z-index: 15;
            animation: travelV 2s infinite ease-in-out;
            pointer-events: none;
        }
        @keyframes travelV {
            0%   { top: 0%;  opacity: 0; }
            25%  { opacity: 1; }
            50%  { top: 100%; margin-top: -12px; opacity: 1; }
            75%  { opacity: 1; }
            100% { top: 0%;  opacity: 0; }
        }

        /* Area labels (pastel glass pill) */
        .area-label {
            position: absolute;
            transform: translateX(-50%);
            color: var(--deep-azure);
            font-size: 11px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.15em;
            white-space: nowrap;
            opacity: 0.85;
            background: rgba(255, 255, 255, 0.6);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            padding: 4px 12px;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.7);
            box-shadow: 0 2px 8px rgba(44, 52, 52, 0.04);
            pointer-events: none;
            z-index: 50;
        }
        /* Dashed divider between area groups */
        .area-divider {
            position: absolute;
            width: 0;
            border-left: 2px dashed #a8b8d0;
            opacity: 0.55;
            z-index: 2;
            pointer-events: none;
        }

        /* ── Staff / Apoyo Layout ─────────────────────────────── */
        .staff-branch-zone { position: relative; width: 100%; display: flex; padding-left: 50%; padding-top: 14px; padding-bottom: 14px; box-sizing: border-box; }
        .staff-branch-vline { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; background: var(--line); transform: translateX(-50%); z-index: 5; overflow: visible; }
        .staff-branch-vline.active { background: var(--primary); box-shadow: 0 0 12px rgba(74,144,226,0.4); }
        .staff-branch-items { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
        .staff-node-outer { display: flex; flex-direction: row; align-items: center; }
        .staff-h-connector { width: 40px; height: 2px; background: var(--line); flex-shrink: 0; position: relative; overflow: visible; }
        .staff-h-connector.active { background: var(--primary); box-shadow: 0 0 12px rgba(74,144,226,0.4); }
        .staff-node-inner { display: flex; flex-direction: column; align-items: center; }

        /* Upward pulse — STAFF → parent */
        @keyframes travelVUp {
            0%   { top: 100%; margin-top: -12px; opacity: 0; }
            25%  { opacity: 1; }
            50%  { top: 0%;   margin-top: 0;     opacity: 1; }
            75%  { opacity: 1; }
            100% { top: 100%; margin-top: -12px; opacity: 0; }
        }
        .pulse-light-v.up { animation: travelVUp 2s infinite ease-in-out; }

        /* ── Functional (dashed) Lines SVG overlay ──────────── */
        .functional-lines-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5; overflow: visible; }
        .functional-line { fill: none; stroke: #b6dbf2; stroke-width: 2; stroke-dasharray: 8,5; stroke-linejoin: round; stroke-linecap: round; opacity: 0.85; filter: drop-shadow(0 2px 4px rgba(74,144,226,0.15)); }

        /* Sidebar (sticky header + glassmorph) */
        #details-modal {
            position: fixed; top: 0; right: 0;
            width: 580px; max-width: 92vw;
            height: 100%;
            background:
                radial-gradient(circle at 20% 0%, rgba(214, 226, 222, 0.35) 0%, transparent 45%),
                radial-gradient(circle at 90% 100%, rgba(214, 207, 224, 0.28) 0%, transparent 50%),
                rgba(255, 255, 255, 0.78);
            backdrop-filter: blur(28px) saturate(140%);
            -webkit-backdrop-filter: blur(28px) saturate(140%);
            border-left: 1px solid var(--glass-border);
            box-shadow: -20px 0 60px rgba(44, 52, 52, 0.12);
            z-index: 1000;
            transform: translateX(100%);
            transition: transform 0.3s ease-out;
            display: flex; flex-direction: column;
            overflow: hidden;
        }
        #details-modal.open { transform: translateX(0); }
        .modal-overlay {
            position: fixed; inset: 0;
            background: rgba(44, 52, 52, 0.25);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
            z-index: 999;
            display: none;
        }
        .modal-overlay.open { display: block; }

        .details-header {
            position: sticky; top: 0; z-index: 5;
            flex-shrink: 0;
            padding: 24px 28px 18px 28px;
            background: rgba(255, 255, 255, 0.65);
            backdrop-filter: blur(18px) saturate(140%);
            -webkit-backdrop-filter: blur(18px) saturate(140%);
            border-bottom: 1px solid rgba(196, 208, 210, 0.4);
            box-shadow: 0 4px 18px -8px rgba(44, 52, 52, 0.08);
        }
        .details-header .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
        .details-header .left { min-width: 0; flex: 1; }
        .details-header .area-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .details-header .area-icon { width: 32px; height: 32px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: rgba(74, 144, 226, 0.12); color: var(--primary); }
        .details-header .area { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.18em; color: var(--deep-azure); margin: 0; }
        .details-header h2 { font-size: 22px; font-weight: 900; margin: 0; line-height: 1.15; color: var(--slate-text); letter-spacing: -0.01em; }
        .details-header .occupant { font-size: 13px; font-weight: 600; color: var(--deep-azure); margin: 4px 0 0 0; }
        .close-btn {
            cursor: pointer; border: 1px solid var(--glass-border);
            background: rgba(255, 255, 255, 0.6);
            backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
            width: 36px; height: 36px; border-radius: 12px;
            display: flex; align-items: center; justify-content: center;
            color: var(--muted);
            transition: all 0.2s;
        }
        .close-btn:hover { background: rgba(255, 255, 255, 0.85); transform: translateY(-1px); }

        .details-body {
            flex: 1; overflow-y: auto;
            padding: 22px 28px 32px 28px;
        }
        .details-body::-webkit-scrollbar { width: 6px; }
        .details-body::-webkit-scrollbar-track { background: transparent; }
        .details-body::-webkit-scrollbar-thumb { background: rgba(196, 208, 210, 0.6); border-radius: 10px; }

        .section-title {
            font-size: 11px; font-weight: 900; color: var(--primary);
            text-transform: uppercase; margin: 22px 0 10px 0;
            border-bottom: 1.5px solid rgba(74, 144, 226, 0.18);
            padding-bottom: 6px; letter-spacing: 0.08em;
        }
        .detail-text {
            font-size: 13px; line-height: 1.6; color: var(--slate-text);
            background: rgba(255, 255, 255, 0.55);
            backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(196, 208, 210, 0.35);
            padding: 14px; border-radius: 14px;
        }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
        .info-card {
            background: rgba(255, 255, 255, 0.55);
            backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(196, 208, 210, 0.35);
            padding: 14px; border-radius: 14px;
        }
        .info-card .label { font-size: 10px; font-weight: 900; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
        .info-card .value { font-weight: 700; font-size: 13px; color: var(--slate-text); margin-top: 4px; }
        ul { padding-left: 18px; margin: 0; }
        li { margin-bottom: 6px; font-size: 13px; color: var(--slate-text); line-height: 1.5; }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>${title}</h1>
            <div class="date">Exportado el: ${date}</div>
        </div>
        <div class="brand">SISTEMA ERP · HACE</div>
    </div>

    <div class="canvas" onclick="clearSelection()">
        <div class="tree-wrapper">
            ${renderTreeNodes(tree, 0, 0)}
            <svg id="functional-lines-svg" class="functional-lines-overlay">
                <defs>
                    <marker id="fl-arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#b6dbf2"/>
                    </marker>
                </defs>
            </svg>
        </div>
    </div>

    <div id="modal-overlay" class="modal-overlay" onclick="closeModal()"></div>
    <div id="details-modal">
        <div id="details-header" class="details-header"></div>
        <div class="details-body">
            <div id="modal-content"></div>
        </div>
    </div>

    <script>
        // Inyectamos el JSON como una cadena de texto simple para evitar problemas con backticks en el compilador
        const rolesDataRaw = '${rolesJson.replace(/'/g, "\\'")}';
        const roles = JSON.parse(rolesDataRaw);

        // ============================================================
        // Layout (líneas horizontales base + etiquetas de área)
        // ============================================================
        function layoutConnectors() {
            // Bases horizontales por fila de hijos
            document.querySelectorAll('.children-row').forEach(function(row) {
                row.querySelectorAll(':scope > .h-line-bar:not(.active)').forEach(function(el) { el.remove(); });

                const wrappers = Array.from(row.children).filter(function(c) {
                    return c.classList && c.classList.contains('tree-node-container');
                });
                if (wrappers.length < 2) return;

                const rowRect = row.getBoundingClientRect();
                const firstCard = wrappers[0].querySelector(':scope > .node-card');
                const lastCard  = wrappers[wrappers.length - 1].querySelector(':scope > .node-card');
                if (!firstCard || !lastCard) return;
                const fr = firstCard.getBoundingClientRect();
                const lr = lastCard.getBoundingClientRect();
                const firstCenter = (fr.left + fr.width / 2) - rowRect.left;
                const lastCenter  = (lr.left + lr.width / 2) - rowRect.left;

                const bar = document.createElement('div');
                bar.className = 'h-line-bar';
                bar.style.left  = firstCenter + 'px';
                bar.style.width = (lastCenter - firstCenter) + 'px';
                row.appendChild(bar);
            });
        }

        // ----- Etiquetas de área (dedup global por nivel/jerarquía) -----
        function renderAreaLabels() {
            // Limpiar previas
            document.querySelectorAll('.area-label, .area-divider').forEach(function(el) { el.remove(); });

            // 1. Pre-calcular cuáles labels son válidos globalmente, replicando la
            //    lógica del componente: por cada children-row, agrupar por área,
            //    descartar grupos con descendientes en la misma área, y registrar
            //    cada (level, area) una sola vez.
            const allowed = {}; // key: parentId|area|level => true
            const levelAreaSeen = {}; // level -> { area: true }

            const rows = Array.from(document.querySelectorAll('.children-row'));
            rows.forEach(function(row) {
                const parentContainer = row.closest('.children-container').parentElement;
                const parentId = parentContainer ? parentContainer.dataset.nodeId : '';

                const wrappers = Array.from(row.children).filter(function(c) {
                    return c.classList && c.classList.contains('tree-node-container');
                });
                if (wrappers.length === 0) return;

                // Agrupar por área (consecutivos)
                const groups = [];
                let current = null;
                wrappers.forEach(function(w) {
                    const area = (w.dataset.area || 'Sin área').trim();
                    if (!current || current.area !== area) {
                        current = { area: area, wrappers: [w] };
                        groups.push(current);
                    } else {
                        current.wrappers.push(w);
                    }
                });

                groups.forEach(function(g) {
                    const isLabelable = g.wrappers.every(function(w) { return w.dataset.areaLabelable === '1'; });
                    if (!isLabelable) return;

                    // Si algún hijo de este grupo tiene su propia subárea con el mismo nombre,
                    // NO etiquetar aquí (la etiqueta se empuja al nivel inferior)
                    const hasSubAreaChildren = g.wrappers.some(function(w) {
                        const cc = w.querySelector(':scope > .children-container');
                        if (!cc) return false;
                        const grand = cc.querySelectorAll(':scope > .children-row > .tree-node-container');
                        return Array.from(grand).some(function(cw) {
                            return (cw.dataset.area || '').trim() === g.area;
                        });
                    });
                    if (hasSubAreaChildren) return;

                    // Determinar nivel (jerarquía del primer hijo del grupo)
                    const firstW = g.wrappers[0];
                    const level = firstW.dataset.jerarquia || ('depth-' + firstW.parentElement.closest('.children-container') ? 'd' : '');
                    if (!levelAreaSeen[level]) levelAreaSeen[level] = {};
                    if (!levelAreaSeen[level][g.area]) {
                        levelAreaSeen[level][g.area] = true;
                        allowed[parentId + '|' + g.area + '|' + level] = true;
                    }
                });
            });

            // 2. Render: divisores entre áreas + etiquetas permitidas
            rows.forEach(function(row) {
                const parentContainer = row.closest('.children-container').parentElement;
                const parentId = parentContainer ? parentContainer.dataset.nodeId : '';

                const wrappers = Array.from(row.children).filter(function(c) {
                    return c.classList && c.classList.contains('tree-node-container');
                });
                if (wrappers.length === 0) return;

                const rowRect = row.getBoundingClientRect();
                const rowHeight = rowRect.height;

                // máxima extensión inferior de las tarjetas (para situar etiqueta debajo)
                let maxBottom = 0;
                wrappers.forEach(function(w) {
                    const card = w.querySelector(':scope > .node-card');
                    if (!card) return;
                    const cr = card.getBoundingClientRect();
                    const b = cr.bottom - rowRect.top;
                    if (b > maxBottom) maxBottom = b;
                });
                const labelTop = maxBottom + 22;

                const groups = [];
                let current = null;
                wrappers.forEach(function(w, idx) {
                    const area = (w.dataset.area || 'Sin área').trim();
                    if (!current || current.area !== area) {
                        current = { area: area, startIdx: idx, wrappers: [w] };
                        groups.push(current);
                    } else {
                        current.wrappers.push(w);
                    }
                });

                groups.forEach(function(g, gi) {
                    if (gi > 0) {
                        const prevW = wrappers[g.startIdx - 1];
                        const prevR = prevW.getBoundingClientRect();
                        const div = document.createElement('div');
                        div.className = 'area-divider';
                        div.style.left = (prevR.right - rowRect.left) + 'px';
                        div.style.top = '0px';
                        div.style.height = rowHeight + 'px';
                        row.appendChild(div);
                    }

                    const firstW = g.wrappers[0];
                    const level = firstW.dataset.jerarquia || '';
                    const key = parentId + '|' + g.area + '|' + level;
                    if (!allowed[key]) return;

                    const firstCard = firstW.querySelector(':scope > .node-card');
                    const lastCard = g.wrappers[g.wrappers.length - 1].querySelector(':scope > .node-card');
                    if (!firstCard || !lastCard) return;
                    const fr = firstCard.getBoundingClientRect();
                    const lr = lastCard.getBoundingClientRect();
                    const centerX = ((fr.left + fr.width / 2) + (lr.left + lr.width / 2)) / 2 - rowRect.left;

                    const lbl = document.createElement('div');
                    lbl.className = 'area-label';
                    lbl.textContent = g.area;
                    lbl.style.left = centerX + 'px';
                    lbl.style.top = labelTop + 'px';
                    row.appendChild(lbl);
                });
            });
        }

        // ============================================================
        // Selección por clic + ruta activa con luz pulsante
        // ============================================================
        function clearSelection() {
            document.querySelectorAll('.node-card.active-card, .node-card.active-path-card').forEach(function(el) {
                el.classList.remove('active-card');
                el.classList.remove('active-path-card');
                var halo = el.querySelector('.click-pulse-halo');
                if (halo) halo.remove();
                var lc = el.dataset.levelColor;
                if (lc) el.style.borderColor = lc + '1A';
            });
            document.querySelectorAll('.tree-node-container.active-branch').forEach(function(el) {
                el.classList.remove('active-branch');
            });
            document.querySelectorAll('.children-container.active-path').forEach(function(el) {
                el.classList.remove('active-path');
            });
            document.querySelectorAll('.staff-h-connector.active').forEach(function(el) {
                el.classList.remove('active');
            });
            document.querySelectorAll('.staff-branch-vline.active').forEach(function(el) {
                el.classList.remove('active');
            });
            document.querySelectorAll('.pulse-light-v, .pulse-light-h').forEach(function(el) { el.remove(); });
            document.querySelectorAll('.h-line-bar.active').forEach(function(el) { el.remove(); });
        }

        function paintActiveHBar(parentContainer, activeChildId, depth) {
            // Dibujar el segmento horizontal activo desde el centro del hijo activo
            // hasta el centro de la línea vertical del padre (drop X = centro de la fila)
            const cc = parentContainer.querySelector(':scope > .children-container');
            if (!cc) return;
            const row = cc.querySelector(':scope > .children-row');
            if (!row) return;
            const rowRect = row.getBoundingClientRect();
            if (rowRect.width < 2) return;

            const wrappers = Array.from(row.children).filter(function(c) {
                return c.classList && c.classList.contains('tree-node-container');
            });
            if (wrappers.length < 2) return; // si solo hay un hijo no hace falta barra horizontal

            const activeIdx = wrappers.findIndex(function(w) { return w.dataset.nodeId === activeChildId; });
            if (activeIdx < 0) return;

            const activeCard = wrappers[activeIdx].querySelector(':scope > .node-card');
            if (!activeCard) return;
            const ar = activeCard.getBoundingClientRect();
            const activeCenter = (ar.left + ar.width / 2) - rowRect.left;
            const dropX = rowRect.width / 2; // children-container-line está centrada
            const left  = Math.min(activeCenter, dropX);
            const right = Math.max(activeCenter, dropX);
            const width = right - left;
            if (width < 1) return;

            const bar = document.createElement('div');
            bar.className = 'h-line-bar active';
            bar.style.left  = left + 'px';
            bar.style.width = width + 'px';
            row.appendChild(bar);

            const midIdx = (wrappers.length - 1) / 2;
            const dir = activeIdx > midIdx ? 'to-right' : 'to-left';
            const pulse = document.createElement('div');
            pulse.className = 'pulse-light-h full ' + dir;
            pulse.style.animationDelay = (depth * 0.3 + 0.1) + 's';
            bar.appendChild(pulse);
        }

        function selectNode(event, roleId) {
            event.stopPropagation();
            clearSelection();

            var path = [];
            var cursor = roles.find(function(r) { return r.id === roleId; });
            while (cursor) {
                path.push(cursor.id);
                cursor = cursor.parent_id ? roles.find(function(r) { return r.id === cursor.parent_id; }) : null;
            }

            path.forEach(function(id, idx) {
                // STAFF nodes render as staff-node-outer, regular nodes as tree-node-container
                var container = document.querySelector('.tree-node-container[data-node-id="' + id + '"]');
                var isStaffNode = false;
                if (!container) {
                    container = document.querySelector('.staff-node-outer[data-node-id="' + id + '"]');
                    isStaffNode = true;
                }
                if (!container) return;
                if (!isStaffNode) container.classList.add('active-branch');

                var card = isStaffNode
                    ? container.querySelector(':scope > .staff-node-inner > .node-card')
                    : container.querySelector(':scope > .node-card');
                if (card) {
                    if (idx === 0) {
                        card.classList.add('active-card');
                        var lc = card.dataset.levelColor;
                        if (lc) card.style.borderColor = lc;
                        var halo = document.createElement('div');
                        halo.className = 'click-pulse-halo';
                        card.appendChild(halo);
                    } else {
                        card.classList.add('active-path-card');
                    }
                }

                // Pulse on connector between this node and its parent
                if (idx < path.length - 1) {
                    if (isStaffNode) {
                        // STAFF: leftward pulse on staff-h-connector
                        var hc = container.querySelector(':scope > .staff-h-connector');
                        if (hc) {
                            hc.classList.add('active');
                            var hp = document.createElement('div');
                            hp.className = 'pulse-light-h full to-left';
                            hp.style.animationDelay = ((path.length - 1 - idx) * 0.3) + 's';
                            hc.appendChild(hp);
                        }
                    } else {
                        var line = container.querySelector(':scope > .tree-node-center-line');
                        if (line) {
                            var dot = document.createElement('div');
                            dot.className = 'pulse-light-v';
                            dot.style.animationDelay = ((path.length - 1 - idx) * 0.3) + 's';
                            line.appendChild(dot);
                        }
                    }
                }

                // Parent-level processing
                if (idx > 0) {
                    var childId = path[idx - 1];
                    var childRole = roles.find(function(r) { return r.id === childId; });
                    var childIsStaff = childRole && childRole.tipo_relacion === 'STAFF';

                    if (childIsStaff) {
                        // Active path goes through a STAFF child: pulse upward on staff-branch-vline
                        var vline = container.querySelector(':scope > .staff-branch-zone > .staff-branch-vline');
                        if (vline) {
                            var upd = document.createElement('div');
                            upd.className = 'pulse-light-v up';
                            upd.style.animationDelay = ((path.length - 1 - idx) * 0.3) + 's';
                            vline.appendChild(upd);
                        }
                    } else {
                        // Active path goes through a regular child
                        var cc = container.querySelector(':scope > .children-container');
                        if (cc) {
                            cc.classList.add('active-path');
                            var ccLine = cc.querySelector(':scope > .children-container-line');
                            if (ccLine) {
                                var dot2 = document.createElement('div');
                                dot2.className = 'pulse-light-v';
                                dot2.style.animationDelay = ((path.length - 1 - idx) * 0.3 + 0.15) + 's';
                                ccLine.appendChild(dot2);
                            }
                        }
                        // If this parent also has a staff-branch-zone, pulse downward on its vline
                        var vlineDown = container.querySelector(':scope > .staff-branch-zone > .staff-branch-vline');
                        if (vlineDown) {
                            vlineDown.classList.add('active');
                            var dvd = document.createElement('div');
                            dvd.className = 'pulse-light-v';
                            dvd.style.animationDelay = ((path.length - 1 - idx) * 0.3 + 0.1) + 's';
                            vlineDown.appendChild(dvd);
                        }
                        paintActiveHBar(container, childId, path.length - 1 - idx);
                    }
                }
            });
        }

        // ============================================================
        // Alineación dinámica de nodos que saltan niveles jerárquicos
        // Replica la lógica de useLayoutEffect del componente React:
        // mide la altura real de las tarjetas de hijos con gap=1 y ajusta
        // el paddingTop de los hijos con gap>1 para que queden a la misma altura.
        // ============================================================
        function alignGapNodes() {
            document.querySelectorAll('.children-row').forEach(function(row) {
                var wrappers = Array.from(row.children).filter(function(c) {
                    return c.classList && c.classList.contains('tree-node-container');
                });
                if (wrappers.length === 0) return;

                // Check if any child has jerarquía gap > 1
                var hasGapGt1 = wrappers.some(function(w) {
                    var j = parseInt(w.dataset.jerarquia || '0');
                    var pj = parseInt(w.dataset.parentJerarquia || '0');
                    return (j - pj) > 1;
                });
                if (!hasGapGt1) return;

                // Measure gap=1 children card heights
                var gap1Heights = [];
                wrappers.forEach(function(w) {
                    var j = parseInt(w.dataset.jerarquia || '0');
                    var pj = parseInt(w.dataset.parentJerarquia || '0');
                    if ((j - pj) === 1) {
                        var card = w.querySelector(':scope > .node-card');
                        if (card) {
                            var h = card.getBoundingClientRect().height;
                            if (h > 10) gap1Heights.push(h);
                        }
                    }
                });
                if (gap1Heights.length === 0) return;

                var avg = gap1Heights.reduce(function(a, b) { return a + b; }, 0) / gap1Heights.length;
                var measuredStep = Math.round(avg) + 96; // CARD_H + children-container(64) + base-node-padding(32)

                // Apply corrected padding to gap>1 nodes
                wrappers.forEach(function(w) {
                    var j = parseInt(w.dataset.jerarquia || '0');
                    var pj = parseInt(w.dataset.parentJerarquia || '0');
                    var gap = Math.max(1, j - pj);
                    if (gap <= 1) return;
                    var newPadding = 32 + (gap - 1) * measuredStep;
                    w.style.paddingTop = newPadding + 'px';
                    var line = w.querySelector(':scope > .tree-node-center-line');
                    if (line) line.style.height = newPadding + 'px';
                });
            });
        }

        function renderFunctionalLines() {
            var svg = document.getElementById('functional-lines-svg');
            var treeWrapper = document.querySelector('.tree-wrapper');
            if (!svg || !treeWrapper) return;

            // Size SVG to cover the full tree content
            var tw = treeWrapper.scrollWidth;
            var th = treeWrapper.scrollHeight;
            svg.setAttribute('width', tw);
            svg.setAttribute('height', th);
            svg.setAttribute('viewBox', '0 0 ' + tw + ' ' + th);

            // Remove previous paths (keep defs)
            Array.from(svg.querySelectorAll('path')).forEach(function(p) { p.remove(); });

            var wrapperRect = treeWrapper.getBoundingClientRect();

            roles.forEach(function(role) {
                if (!role.relacion_funcional || role.relacion_funcional.length === 0) return;
                var srcCard = document.querySelector('.node-card[data-node-id="' + role.id + '"]');
                if (!srcCard) return;
                var sr = srcCard.getBoundingClientRect();
                var sx = {
                    left:   sr.left   - wrapperRect.left,
                    right:  sr.right  - wrapperRect.left,
                    bottom: sr.bottom - wrapperRect.top,
                    midX:  (sr.left   + sr.right)  / 2 - wrapperRect.left,
                    midY:  (sr.top    + sr.bottom) / 2 - wrapperRect.top
                };
                var isStaffSrc = role.tipo_relacion === 'STAFF';
                var x1 = isStaffSrc ? sx.right  : sx.midX;
                var y1 = isStaffSrc ? sx.midY   : sx.bottom;

                role.relacion_funcional.forEach(function(targetId) {
                    var tgtCard = document.querySelector('.node-card[data-node-id="' + targetId + '"]');
                    if (!tgtCard) return;
                    var tr2 = tgtCard.getBoundingClientRect();
                    var tx = {
                        left:  tr2.left  - wrapperRect.left,
                        right: tr2.right - wrapperRect.left,
                        midX:  (tr2.left  + tr2.right)  / 2 - wrapperRect.left,
                        midY:  (tr2.top   + tr2.bottom) / 2 - wrapperRect.top
                    };
                    var x2 = tx.midX >= sx.midX ? tx.left : tx.right;
                    var y2 = tx.midY;
                    var d = isStaffSrc
                        ? 'M ' + x1 + ' ' + y1 + ' H ' + (x1 + 40) + ' V ' + y2 + ' H ' + x2
                        : 'M ' + x1 + ' ' + y1 + ' V ' + y2 + ' H ' + x2;
                    var pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    pathEl.setAttribute('d', d);
                    pathEl.setAttribute('class', 'functional-line');
                    pathEl.setAttribute('marker-end', 'url(#fl-arrow)');
                    svg.appendChild(pathEl);
                });
            });
        }

        function relayout() {
            alignGapNodes();
            layoutConnectors();
            renderAreaLabels();
            renderFunctionalLines();
        }

        window.addEventListener('load', function() {
            if (document.fonts && document.fonts.ready) {
                document.fonts.ready.then(relayout);
            } else {
                relayout();
            }
            // Doble pase por si las fuentes/material symbols cambian medidas tarde
            setTimeout(relayout, 250);
            setTimeout(relayout, 800);
        });
        window.addEventListener('resize', function() {
            clearTimeout(window.__layoutTimer);
            window.__layoutTimer = setTimeout(relayout, 120);
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                clearSelection();
                closeModal();
            }
        });

        function getRoleIcon(roleName) {
            const name = (roleName || '').toLowerCase();
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
        }

        function showDetails(roleId) {
            const role = roles.find(function(r) { return r.id === roleId; });
            if (!role) return;

            const subordinates = roles.filter(function(r) { return r.parent_id === roleId; });
            const iconName = getRoleIcon(role.nombre_cargo);

            const headerHtml =
                '<div class="row">' +
                    '<div class="left">' +
                        '<div class="area-row">' +
                            '<div class="area-icon"><span class="material-symbols-outlined" style="font-size:18px">' + iconName + '</span></div>' +
                            '<p class="area">' + (role.area || 'Sin área') + '</p>' +
                        '</div>' +
                        '<h2>' + role.nombre_cargo + '</h2>' +
                        (role.nombres ? '<p class="occupant">' + role.nombres + '</p>' : '') +
                    '</div>' +
                    '<button class="close-btn" onclick="closeModal()">' +
                        '<span class="material-symbols-outlined">close</span>' +
                    '</button>' +
                '</div>';

            let content =
                '<div class="section-title">Propósito del Cargo</div>' +
                '<div class="detail-text">' + (role.proposito || 'No definido') + '</div>' +
                '<div class="info-grid">' +
                    '<div class="info-card">' +
                        '<div class="label">Reporta a:</div>' +
                        '<div class="value">' + (role.reporta_a || 'Máximo Cargo') + '</div>' +
                    '</div>' +
                    '<div class="info-card">' +
                        '<div class="label">Supervisa a:</div>' +
                        '<div class="value">' + subordinates.length + ' puesto' + (subordinates.length === 1 ? '' : 's') + '</div>' +
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

            document.getElementById('details-header').innerHTML = headerHtml;
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
