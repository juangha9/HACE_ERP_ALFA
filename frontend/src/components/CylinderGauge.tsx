import './CylinderGauge.css';

interface Props {
  totalPlanilla: number;  // El costo que necesitamos cubrir
  fondosDisponibles: number; // El dinero que tenemos
}

export default function CylinderGauge({ totalPlanilla, fondosDisponibles }: Props) {
  
  // --- Lógica de Cálculo ---
  let percentage = 0;
  if (fondosDisponibles > 0) {
    // Calculamos qué porcentaje de la planilla está cubierto por los fondos
    percentage = (fondosDisponibles / totalPlanilla) * 100;
  }

  // Nos aseguramos de que el porcentaje no supere el 100% para la visualización
  const displayPercentage = Math.min(percentage, 100);

  // Formateadores de moneda para mostrar los valores
  const formatCurrency = (value: number) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);

  return (
    <div className="cylinder-gauge-card">
      <div className="header">
        <h3>Fondos vs. Planilla</h3>
        <p>Capacidad para cubrir la planilla con los fondos de proyectos cerrados.</p>
      </div>
      
      <div className="cylinder-container">
        <div className="cylinder-liquid" style={{ height: `${displayPercentage}%` }}></div>
      </div>

      <div className="cylinder-info">
        <div className="cylinder-percentage">{percentage.toFixed(1)}% Cubierto</div>
        <div className="cylinder-values">
          <strong>Fondos:</strong> {formatCurrency(fondosDisponibles)} / <strong>Planilla:</strong> {formatCurrency(totalPlanilla)}
        </div>
      </div>
    </div>
  );
}