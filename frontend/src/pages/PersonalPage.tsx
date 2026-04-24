
import { useState, useEffect, type FormEvent } from 'react';
import Modal from '../components/Modal';
import TotalPlanillaCard from '../components/TotalPlanillaCard';
import CylinderGauge from '../components/CylinderGauge';
import '../components/Modal.css';
import './PersonalPage.css';
import './GestorPersonal.css';
import './PersonalPageLayout.css';

import { api, type Colaborador } from '../services/api';
import Organigrama from './Personal/Organigrama';

// --- El componente ahora jala datos de Supabase directamente ---

// --- Helpers de Validación ---
const handleNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (['e', 'E', '+', '-', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault();
  }
};

const handleDniKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  // Teclas de control funcional
  const controlKeys = ['Backspace', 'Tab', 'ArrowLeft', 'ArrowRight', 'Delete', 'Enter'];
  // Teclas para atajos comunes (Ctrl+C, Ctrl+V, etc.)
  const shortcutKeys = ['c', 'v', 'a', 'x'];
  const ctrlOrMeta = e.ctrlKey || e.metaKey;
  
  if (controlKeys.includes(e.key) || (ctrlOrMeta && shortcutKeys.includes(e.key.toLowerCase()))) {
    return;
  }

  // Solo permitir números 0-9
  if (!/^[0-9]$/.test(e.key)) {
    e.preventDefault();
  }
};

// --- Componente Principal ---
export default function PersonalPage() {
  const [allStaff, setAllStaff] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(true);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isManagerModalOpen, setIsManagerModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingColaborador, setEditingColaborador] = useState<Colaborador | null>(null);
  const [showOrganigrama, setShowOrganigrama] = useState(false);
  const [isFormalizingModalOpen, setIsFormalizingModalOpen] = useState(false);
  const [personaToFormalize, setPersonaToFormalize] = useState<Colaborador | null>(null);
  const [isActionProcessing, setIsActionProcessing] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isAlert?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    isAlert: false,
    onConfirm: () => { },
  });

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const [staffData, rolesData] = await Promise.all([
        api.getPersonalStaff(),
        api.getRoles()
      ]);

      // Combinar: Si un rol tiene un nombre asignado pero no está en personal_staff, lo añadimos como "Virtual"
      // Evitamos duplicar por nombre si el DNI es el mismo placeholder
      const virtualStaff: Colaborador[] = [];
      const seenNames = new Set(staffData.map(p => `${p.nombres} ${p.apellidos}`.trim().toLowerCase()));

      rolesData.forEach(r => {
        if (!r.nombres) return;
        const fullName = r.nombres.trim().toLowerCase();
        
        // Si el DNI ya está en staffData, ya lo manejamos en mergedStaff
        if (r.dni && staffData.find(p => p.dni === r.dni)) return;
        
        // Si el DNI no está, pero el nombre ya está en staffData o virtualStaff, omitimos duplicar el "Cuerpo" (Persona)
        // ya que la Persona es única aunque ocupe varios roles.
        if (!seenNames.has(fullName)) {
           virtualStaff.push({
              dni: r.dni || `ROL-${r.id}`,
              nombres: r.nombres.split(' ')[0] || r.nombres,
              apellidos: r.nombres.split(' ').slice(1).join(' ') || '(Desde Organigrama)',
              cargo: r.nombre_cargo,
              sueldo: r.sueldo || 0,
              tipo: 'Tercero',
              adelantos: 0,
              id: r.id
           });
           seenNames.add(fullName);
        }
      });

      // Actualizar cargos de personal_staff si están en roles
      const mergedStaff = staffData.map(p => {
        const role = rolesData.find(r => r.dni === p.dni);
        if (role) {
          return { ...p, cargo: role.nombre_cargo, sueldo: role.sueldo || p.sueldo };
        }
        return p;
      });

      setAllStaff([...mergedStaff, ...virtualStaff]);
    } catch (error) {
      console.error("Error cargando personal:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if ('fonts' in document) {
        document.fonts.ready.then(() => setFontsLoaded(true));
    } else {
        setFontsLoaded(true);
    }
    fetchStaff();
  }, []);

  const moverAPlanilla = (dni: string) => {
    const persona = allStaff.find(p => p.dni === dni);
    if (!persona) return;

    setConfirmModal({
      isOpen: true,
      title: 'Añadir a Planilla',
      message: `¿Está seguro de que desea añadir a ${persona.nombres} ${persona.apellidos} a la planilla actual?`,
      onConfirm: async () => {
        setIsActionProcessing(true);
        if (persona.dni.startsWith('ROL-')) {
          setPersonaToFormalize(persona);
          setIsFormalizingModalOpen(true);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          setIsActionProcessing(false);
          return;
        }
        try {
          // Empleado real, solo actualizar tipo
          await api.updatePersonalStaff(dni, { tipo: 'Planilla' });
          await fetchStaff();
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          console.error("Error al mover a planilla:", error);
          alert("Error al actualizar en la base de datos.");
        } finally {
          setIsActionProcessing(false);
        }
      }
    });
  };

  const moverADisponible = (dni: string) => {
    const persona = allStaff.find(p => p.dni === dni);
    if (!persona) return;

    setConfirmModal({
      isOpen: true,
      title: 'Quitar de Planilla',
      message: `¿Está seguro de que desea quitar a ${persona.nombres} ${persona.apellidos} de la planilla actual?`,
      onConfirm: async () => {
        try {
          await api.updatePersonalStaff(dni, { tipo: 'Tercero' });
          await fetchStaff();
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          alert("Error al actualizar en la base de datos.");
        }
      }
    });
  };

  const handleAddColaborador = async (newColaborador: Omit<Colaborador, 'adelantos' | 'id'>) => {
    setIsActionProcessing(true);
    try {
      const existingPerson = allStaff.find(p => p.dni === newColaborador.dni && !p.dni.startsWith('ROL-'));
      if (existingPerson) {
        setConfirmModal({
          isOpen: true,
          isAlert: true,
          title: 'DNI Duplicado',
          message: `El número de documento ${newColaborador.dni} ya le pertenece a otra persona en el registro.`,
          onConfirm: () => {}
        });
        setIsActionProcessing(false);
        return;
      }

      const colaboradorToAdd: Omit<Colaborador, 'id'> = { ...newColaborador, adelantos: 0 };
      await api.savePersonalStaff(colaboradorToAdd);
      await fetchStaff();
      setIsAddModalOpen(false);
    } catch (error) {
      alert("Error al guardar el colaborador. Verifique que el DNI no esté duplicado.");
    } finally {
      setIsActionProcessing(false);
    }
  };

  const handleUpdateColaborador = async (updatedData: Partial<Colaborador>) => {
    if (!editingColaborador) return;
    setIsActionProcessing(true);
    try {
      const oldDni = editingColaborador.dni;
      const { dni: newDni, ...rest } = updatedData;

      if (!newDni) {
        alert("El DNI es un campo obligatorio.");
        setIsActionProcessing(false);
        return;
      }

      const isVirtual = oldDni.startsWith('ROL-');

      if (isVirtual) {
        // Formalizar desde el modal de edición
        const existingPerson = allStaff.find(p => p.dni === newDni && !p.dni.startsWith('ROL-'));

        if (existingPerson) {
          setConfirmModal({
            isOpen: true,
            isAlert: true,
            title: 'DNI en Uso',
            message: `El documento ${newDni} ya está registrado a nombre de otra persona.`,
            onConfirm: () => {}
          });
          setIsActionProcessing(false);
          return;
        } else {
          // Nuevo empleado, lo creamos y vinculamos
          await api.savePersonalStaff({ dni: newDni, ...(rest as any), adelantos: 0 });
          if (editingColaborador.id) {
            await api.saveRole({ id: editingColaborador.id, dni: newDni });
          }
        }
      } else {
        // Empleado real
        if (newDni !== oldDni) {
           const existingPerson = allStaff.find(p => p.dni === newDni);
           if (existingPerson) {
             setConfirmModal({
               isOpen: true,
               isAlert: true,
               title: 'DNI Duplicado',
               message: `No se puede actualizar al documento ${newDni} porque ya existe.`,
               onConfirm: () => {}
             });
             setIsActionProcessing(false);
             return;
           }
        }

        await api.updatePersonalStaff(oldDni, updatedData);
        
        if (newDni !== oldDni) {
           const rolesData = await api.getRoles();
           const linkedRole = rolesData.find(r => r.dni === oldDni);
           if (linkedRole) {
             await api.saveRole({ id: linkedRole.id, dni: newDni });
           }
        }
      }
      await fetchStaff();
      setEditingColaborador(null);
    } catch (error) {
      console.error("Error al actualizar colaborador:", error);
      alert("Error al actualizar la información del colaborador. Verifique que el nuevo DNI no esté duplicado.");
    } finally {
      setIsActionProcessing(false);
    }
  };

  const personalEnPlanilla = allStaff.filter(p => p.tipo === 'Planilla');
  const personalDisponible = allStaff.filter(p => p.tipo !== 'Planilla');

  const normalizedSearch = searchTerm.toLowerCase().trim().replace(/\s+/g, ' ');
  const filteredPlanilla = personalEnPlanilla.filter(p => {
    if (!normalizedSearch) return true;
    const fullName = `${p.nombres} ${p.apellidos}`.toLowerCase();
    const reverseName = `${p.apellidos} ${p.nombres}`.toLowerCase();
    
    return fullName.includes(normalizedSearch) || 
           reverseName.includes(normalizedSearch) || 
           p.dni.includes(normalizedSearch);
  });

  const totalSueldos = personalEnPlanilla.reduce((total, persona) => total + Number(persona.sueldo || 0), 0);

  return (
    <>
      <div 
        key={(loading || !fontsLoaded) ? 'loading' : 'content'}
        className={`personal-page-container animate-premium-fade`}
      >
        <div className="page-header">
        <div className="page-title">
          <h1>Gestión de Personal</h1>
          <p>Administra la planilla de tus colaboradores y su impacto financiero.</p>
        </div>
        <div className="financial-widgets">
          <TotalPlanillaCard personalEnPlanilla={personalEnPlanilla} />
          <CylinderGauge totalPlanilla={totalSueldos} fondosDisponibles={25000} />
        </div>
      </div>

      {showOrganigrama ? (
        <Organigrama onBack={() => setShowOrganigrama(false)} />
      ) : (
        <>
          <div className="main-card">
        <div className="table-controls">
          <div className="search-box"><span className="material-symbols-outlined">search</span><input type="text" placeholder="Buscar en planilla..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
          <div className="flex gap-3">
            <button className="button secondary" onClick={() => setShowOrganigrama(true)}>
              <span className="material-symbols-outlined" style={{ marginRight: '8px' }}>account_tree</span>
              Organigrama
            </button>
            <button className="button" onClick={() => setIsManagerModalOpen(true)}>Gestor de Personal</button>
          </div>
        </div>
        {loading ? (
             <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Cargando información del personal...</div>
        ) : (
            <PersonalTable personal={filteredPlanilla} />
        )}
          </div>
        </>
      )}
    </div>

    {confirmModal.isOpen && (
      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={() => {
          confirmModal.onConfirm();
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        isAlert={confirmModal.isAlert}
      />
    )}

    <Modal isOpen={isManagerModalOpen} onClose={() => setIsManagerModalOpen(false)}>
        <div className="gestor-header"><h2>Gestor de Personal</h2><button className="button" onClick={() => setIsAddModalOpen(true)}>Registrar Trabajador</button></div>
        <div className="gestor-list-container">
          {/* Lista con botones de solo ícono */}
          <div className="gestor-list">
            <h3>Personal Disponible</h3>
            <ul>
              {personalDisponible.map(p => (
                <li key={p.dni} className="gestor-list-item">
                  <p>
                    {p.nombres} {p.apellidos}
                    <span>{p.cargo} — <strong style={{ color: '#16a34a' }}>+ S/ {p.sueldo}</strong></span>
                  </p>
                  <div className="gestor-actions-group">
                    <button 
                      className="gestor-action-button edit" 
                      onClick={() => setEditingColaborador(p)}
                      disabled={isActionProcessing}
                    >
                      <span className="material-symbols-outlined">edit</span>
                    </button>
                    <button 
                      className="gestor-action-button add" 
                      onClick={() => moverAPlanilla(p.dni)}
                      disabled={isActionProcessing}
                    >
                      <span className="material-symbols-outlined">add</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="gestor-list">
            <h3>Personal en Planilla Actual</h3>
            <ul>
              {personalEnPlanilla.map(p => (
                <li key={p.dni} className="gestor-list-item">
                  <p>
                    {p.nombres} {p.apellidos}
                    <span>{p.cargo} — <strong style={{ color: '#dc2626' }}>- S/ {p.sueldo}</strong></span>
                  </p>
                  <div className="gestor-actions-group">
                    <button 
                      className="gestor-action-button edit" 
                      onClick={() => setEditingColaborador(p)}
                      disabled={isActionProcessing}
                    >
                      <span className="material-symbols-outlined">edit</span>
                    </button>
                    <button 
                      className="gestor-action-button remove" 
                      onClick={() => moverADisponible(p.dni)}
                      disabled={isActionProcessing}
                    >
                      <span className="material-symbols-outlined">remove</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Modal>
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)}>
        <div style={{ marginTop: '40px' }}>
          <AddColaboradorForm 
            onAddColaborador={handleAddColaborador} 
            handleNumberKeyDown={handleNumberKeyDown}
            isProcessing={isActionProcessing}
          />
        </div>
      </Modal>
      
      <Modal isOpen={!!editingColaborador} onClose={() => setEditingColaborador(null)}>
        {editingColaborador && (
          <EditColaboradorForm 
            colaborador={editingColaborador} 
            onUpdateColaborador={handleUpdateColaborador} 
            onClose={() => setEditingColaborador(null)}
            handleNumberKeyDown={handleNumberKeyDown}
            isProcessing={isActionProcessing}
          />
        )}
      </Modal>

      <Modal isOpen={isFormalizingModalOpen} onClose={() => setIsFormalizingModalOpen(false)}>
        {personaToFormalize && (
          <FormalizeStaffForm 
            persona={personaToFormalize}
            onFormalize={async (realDni) => {
              setIsActionProcessing(true);
              try {
                // 1. Verificamos si el DNI ingresado ya existe en la base de datos
                const existingPerson = allStaff.find(p => p.dni === realDni && !p.dni.startsWith('ROL-'));

                if (existingPerson) {
                  setConfirmModal({
                    isOpen: true,
                    isAlert: true,
                    title: 'DNI Duplicado',
                    message: `El número de documento ${realDni} ya le pertenece a la persona registrada como ${existingPerson.nombres} ${existingPerson.apellidos}.`,
                    onConfirm: () => {}
                  });
                  setIsActionProcessing(false);
                  return;
                } else {
                  // 2. Si es nuevo, Crear el registro real en personal_staff
                  await api.savePersonalStaff({
                    dni: realDni,
                    nombres: personaToFormalize.nombres,
                    apellidos: personaToFormalize.apellidos === '(Desde Organigrama)' ? '' : personaToFormalize.apellidos,
                    cargo: personaToFormalize.cargo,
                    sueldo: personaToFormalize.sueldo,
                    tipo: 'Planilla',
                    adelantos: 0
                  });

                  // 3. Vincular el ROL con el nuevo DNI
                  if (personaToFormalize.id) {
                    await api.saveRole({ id: personaToFormalize.id, dni: realDni });
                  }
                }

                await fetchStaff();
                setIsFormalizingModalOpen(false);
                setPersonaToFormalize(null);
              } catch (error) {
                alert("Error al formalizar colaborador. Verifique que el DNI sea válido.");
              } finally {
                setIsActionProcessing(false);
              }
            }}
            onCancel={() => setIsFormalizingModalOpen(false)}
            isProcessing={isActionProcessing}
          />
        )}
      </Modal>

      {/* Modal de Confirmación Personalizado */}
      <Modal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}>
        <div className="confirm-modal-content">
          <div className="confirm-icon-wrapper">
            <span className="material-symbols-outlined">{confirmModal.isAlert ? 'error' : 'help_outline'}</span>
          </div>
          <h2>{confirmModal.title}</h2>
          <p>{confirmModal.message}</p>
          <div className="confirm-actions">
            {!confirmModal.isAlert && (
              <button
                className="button secondary"
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
              >
                Cancelar
              </button>
            )}
            <button
              className="button"
              onClick={() => {
                if (confirmModal.isAlert) {
                  setConfirmModal(prev => ({ ...prev, isOpen: false }));
                } else {
                  confirmModal.onConfirm();
                }
              }}
            >
              {confirmModal.isAlert ? 'Entendido' : 'Confirmar Acción'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function EditColaboradorForm({ colaborador, onUpdateColaborador, onClose, handleNumberKeyDown, isProcessing }: { 
  colaborador: Colaborador, 
  onUpdateColaborador: (c: Partial<Colaborador>) => void, 
  onClose: () => void,
  handleNumberKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void,
  isProcessing: boolean
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const updatedColaborador = {
      dni: formData.get('dni') as string, // Incluimos DNI para formalización
      nombres: formData.get('nombres') as string,
      apellidos: formData.get('apellidos') as string,
      cargo: formData.get('cargo') as string,
      sueldo: parseFloat(formData.get('sueldo') as string),
      tipo: formData.get('tipo') as 'Planilla' | 'Tercero',
    };
    onUpdateColaborador(updatedColaborador);
  };

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: '24px' }}>Editar Colaborador</h2>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="form-group full-width">
          <label htmlFor="dni">Documento de Identidad (DNI)</label>
          <input 
            name="dni"
            id="dni"
            onKeyDown={handleDniKeyDown}
            inputMode="numeric"
            defaultValue={colaborador.dni.startsWith('ROL-') ? '' : colaborador.dni} 
            placeholder={colaborador.dni.startsWith('ROL-') ? "Asigne un DNI real" : "Ingrese DNI"}
            required
            autoFocus={colaborador.dni.startsWith('ROL-')}
          />
        </div>
        <div className="form-group"><label htmlFor="nombres">Nombres</label><input name="nombres" id="nombres" defaultValue={colaborador.nombres} required autoFocus /></div>
        <div className="form-group"><label htmlFor="apellidos">Apellidos</label><input name="apellidos" id="apellidos" defaultValue={colaborador.apellidos} required /></div>
        <div className="form-group full-width"><label htmlFor="cargo">Cargo</label><input name="cargo" id="cargo" defaultValue={colaborador.cargo} required /></div>
        <div className="form-group"><label htmlFor="sueldo">Sueldo Bruto (S/)</label>
          <input 
            type="number" 
            step="0.01" 
            name="sueldo" 
            id="sueldo" 
            defaultValue={colaborador.sueldo} 
            required 
            onKeyDown={handleNumberKeyDown}
            onWheel={(e) => e.currentTarget.blur()}
          />
        </div>
        <div className="form-group"><label htmlFor="tipo">Tipo de Contrato</label>
          <select name="tipo" id="tipo" defaultValue={colaborador.tipo} required>
            <option value="Tercero">Tercero</option>
            <option value="Planilla">Planilla</option>
          </select>
        </div>
        <div className="form-group full-width" style={{ display: 'flex', flexDirection: 'row', gap: '12px', marginTop: '12px' }}>
          <button type="button" className="button secondary" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }} disabled={isProcessing}>Cancelar</button>
          <button type="submit" className="button" style={{ flex: 2, justifyContent: 'center' }} disabled={isProcessing}>
            {isProcessing ? 'Actualizando...' : 'Actualizar Información'}
          </button>
        </div>
      </form>
    </div>
  );
}

function FormalizeStaffForm({ persona, onFormalize, onCancel, isProcessing }: { 
  persona: Colaborador, 
  onFormalize: (dni: string) => void,
  onCancel: () => void,
  isProcessing: boolean
}) {
  const [dni, setDni] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dni.trim()) onFormalize(dni.trim());
  };

  return (
    <div className="p-4">
      <div className="confirm-icon-wrapper" style={{ marginBottom: '20px' }}>
        <span className="material-symbols-outlined">how_to_reg</span>
      </div>
      <h2 style={{ textAlign: 'center', marginBottom: '8px' }}>Formalizar Colaborador</h2>
      <p style={{ textAlign: 'center', color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>
        Asigne un documento de identidad oficial para <strong>{persona.nombres} {persona.apellidos}</strong> para registrarlo formalmente en el sistema.
      </p>
      
      <form onSubmit={handleSubmit} className="form-grid">
        <div className="form-group full-width">
          <label htmlFor="formalize-dni">DNI / Documento de Identidad</label>
          <input 
            id="formalize-dni"
            autoFocus 
            required 
            onKeyDown={handleDniKeyDown}
            inputMode="numeric"
            placeholder="Ingrese el número de documento..."
            value={dni}
            onChange={(e) => setDni(e.target.value)}
          />
        </div>
        <div className="confirm-actions" style={{ marginTop: '24px', width: '100%', gap: '12px' }}>
          <button type="button" className="button secondary" onClick={onCancel} style={{ flex: 1 }} disabled={isProcessing}>Cancelar</button>
          <button type="submit" className="button" style={{ flex: 2 }} disabled={isProcessing}>
            {isProcessing ? 'Formalizando...' : 'Formalizar Registro'}
          </button>
        </div>
      </form>
    </div>
  );
}

function PersonalTable({ personal }: { personal: Colaborador[] }) {
  return (
    <table>
      <thead><tr><th>DNI</th><th>Nombres y Apellidos</th><th>Cargo</th><th>Tipo</th><th>Sueldo Bruto</th><th>Adelantos</th><th>Acciones</th></tr></thead>
      <tbody>
        {personal.length > 0 ? personal.map(persona => (
          <tr key={persona.dni}>
            <td><strong>{persona.dni}</strong></td>
            <td>{`${persona.nombres} ${persona.apellidos}`}</td>
            <td>{persona.cargo}</td>
            <td><span className={`pill ${persona.tipo.toLowerCase()}`}>{persona.tipo}</span></td>
            <td>S/ {persona.sueldo.toFixed(2)}</td>
            <td className={persona.adelantos < 0 ? 'adelantos-negativos' : ''}>S/ {persona.adelantos.toFixed(2)}</td>
            <td><span className="material-symbols-outlined">more_horiz</span></td>
          </tr>
        )) : (
          <tr><td colSpan={7}>No hay personal en la planilla actual.</td></tr>
        )}
      </tbody>
    </table >
  );
}

const AddColaboradorForm = ({ onAddColaborador, handleNumberKeyDown, isProcessing }: { 
  onAddColaborador: (c: Omit<Colaborador, 'adelantos'>) => void,
  handleNumberKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void,
  isProcessing: boolean
}) => {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const newColaborador = {
      dni: formData.get('dni') as string,
      nombres: formData.get('nombres') as string,
      apellidos: formData.get('apellidos') as string,
      cargo: formData.get('cargo') as string,
      sueldo: parseFloat(formData.get('sueldo') as string),
      tipo: formData.get('tipo') as 'Planilla' | 'Tercero',
    };
    if (newColaborador.dni && newColaborador.nombres && newColaborador.sueldo) {
      onAddColaborador(newColaborador);
      event.currentTarget.reset();
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: '24px' }}>Registrar Nuevo Colaborador</h2>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="form-group full-width">
          <label htmlFor="dni">DNI</label>
          <input 
            name="dni" 
            id="dni" 
            required 
            onKeyDown={handleDniKeyDown} 
            inputMode="numeric"
          />
        </div>
        <div className="form-group"><label htmlFor="nombres">Nombres</label><input name="nombres" id="nombres" required /></div>
        <div className="form-group"><label htmlFor="apellidos">Apellidos</label><input name="apellidos" id="apellidos" required /></div>
        <div className="form-group full-width"><label htmlFor="cargo">Cargo</label><input name="cargo" id="cargo" required /></div>
        <div className="form-group hover-target"><label htmlFor="sueldo">Sueldo Bruto (S/)</label>
          <input 
            type="number" 
            step="0.01" 
            name="sueldo" 
            id="sueldo" 
            required 
            onKeyDown={handleNumberKeyDown}
            onWheel={(e) => e.currentTarget.blur()}
          />
        </div>
        <div className="form-group"><label htmlFor="tipo">Tipo de Contrato</label><select name="tipo" id="tipo" required><option value="Tercero">Tercero</option><option value="Planilla">Planilla</option></select></div>
        <div className="form-group full-width"><button type="submit" className="button" style={{ width: '100%', justifyContent: 'center' }} disabled={isProcessing}>
            {isProcessing ? 'Guardando...' : 'Guardar Colaborador'}
        </button></div>
      </form>
    </div>
  );
}