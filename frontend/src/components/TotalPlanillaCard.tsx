import './TotalPlanillaCard.css';

// Definimos la "forma" de los datos que espera el componente
interface Colaborador {
  sueldo: number;
}

interface Props {
  personalEnPlanilla: Colaborador[];
}

// El componente en sí
export default function TotalPlanillaCard({ personalEnPlanilla }: Props) {
  
  // --- Lógica de Cálculo ---
  // Usamos `reduce` para sumar los sueldos de todos los colaboradores en la lista.
  // Empezamos con un total de 0 y vamos sumando el `sueldo` de cada `persona`.
  const totalSueldos = personalEnPlanilla.reduce((total, persona) => total + persona.sueldo, 0);

  // --- Formateo del Número ---
  // Convertimos el número (ej: 12500.5) a un formato de moneda local (ej: "12,500.50")
  const formattedTotal = new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(totalSueldos);

  return (
    <div className="total-planilla-card">
      <div className="header">
        <h3>Costo Total de Planilla Bruta</h3>
        <span className="material-icons">payments</span>
      </div>
      <div className="amount-container">
        <p className="amount">
          <span className="amount-currency">S/</span>
          {formattedTotal}
        </p>
        <p className="description">Suma de sueldos brutos del personal en la planilla actual.</p>
      </div>
    </div>
  );
}