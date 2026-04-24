import React from 'react';
import './Modal.css';

// Definimos las propiedades que el componente Modal aceptará
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  contentClassName?: string;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children, contentClassName }) => {
  // Si el modal no está abierto, no renderizamos nada
  if (!isOpen) {
    return null;
  }

  return (
    // El "portal" o fondo oscuro que cubre toda la pantalla.
    // Se ha eliminado `onClick={onClose}` para evitar que se cierre accidentalmente.
    <div className="modal-overlay">
      {/* El contenedor del contenido del modal */}
      <div className={`modal-content ${contentClassName || ''}`} onClick={(e) => e.stopPropagation()}>
        {/* Botón para cerrar el modal ("X") */}
        <button className="modal-close-button" onClick={onClose}>
          <span className="material-symbols-outlined">close</span>
        </button>
        {/* Aquí se renderizará el contenido que le pasemos al modal */}
        {children}
      </div>
    </div>
  );
};

export default Modal;