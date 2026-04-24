import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { ProjectDetails } from './pages/ProjectDetails';
import PersonalPage from './pages/PersonalPage';
import SettingsPage from './pages/SettingsPage';
import CostConfigurationPage from './pages/CostConfigurationPage';
import WarehouseConfigurationPage from './pages/WarehouseConfigurationPage';
import DatabaseExportPage from './pages/DatabaseExportPage';
import PresupuestadorLayout from './pages/Presupuestador/PresupuestadorLayout';
import PresupuestadorWizard from './pages/Presupuestador/PresupuestadorWizard';
import PresupuestadorDashboard from './pages/Presupuestador/PresupuestadorDashboard';
import { SalesTreasuryPage } from './pages/SalesTreasuryPage';
import { SolicitudesPage } from './pages/SolicitudesPage';


// Optimization
import { OptimizationLayout } from './pages/Optimization/OptimizationLayout';

// Inventory Module
import InventoryLayout from './pages/Inventory/InventoryLayout';
import InventoryDashboard from './pages/Inventory/InventoryDashboard';
import InventoryProducts from './pages/Inventory/InventoryProducts';
import InventoryMovements from './pages/Inventory/InventoryMovements';
import InventoryLocations from './pages/Inventory/InventoryLocations';
import ContactDirectory from './pages/Inventory/ContactDirectory';
import InventoryReports from './pages/Inventory/InventoryReports';
import { CatalogPage } from './pages/Inventory/Catalog/CatalogPage';

const App = () => {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="projects/:id" element={<ProjectDetails />} />
          <Route path="personnel" element={<PersonalPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="configuracion-costos" element={<CostConfigurationPage />} />
          <Route path="configuracion-almacen" element={<WarehouseConfigurationPage />} />
          <Route path="base-de-datos" element={<DatabaseExportPage />} />
          <Route path="sales-treasury" element={<SalesTreasuryPage />} />
          <Route path="solicitudes" element={<SolicitudesPage />} />


          {/* Presupuestador Module */}
          <Route path="presupuestador" element={<PresupuestadorLayout />}>
            <Route index element={<PresupuestadorDashboard />} />
            <Route path="nuevo" element={<PresupuestadorWizard />} />
            <Route path="editar/:id" element={<PresupuestadorWizard />} />
          </Route>

          {/* Optimization Module */}
          <Route path="optimizacion">
            <Route index element={
              <React.Suspense fallback={<div>Loading...</div>}>
                {React.createElement(React.lazy(() => import('./pages/Optimization/ProjectsList').then(m => ({ default: m.ProjectsList }))))}
              </React.Suspense>
            } />
            <Route path="editor/:projectId" element={<OptimizationLayout />} />
          </Route>

          {/* Inventory Module */}
          <Route path="inventory" element={<InventoryLayout />}>
            <Route index element={<InventoryDashboard />} />
            <Route path="catalog" element={<CatalogPage />} />
            <Route path="list" element={<InventoryProducts />} />
            <Route path="movements" element={<InventoryMovements />} />
            <Route path="locations" element={<InventoryLocations />} />
            <Route path="contacts" element={<ContactDirectory />} />
            <Route path="reports" element={<InventoryReports />} />
            <Route path="requests" element={
              <React.Suspense fallback={<div>Loading...</div>}>
                {React.createElement(React.lazy(() => import('./pages/Inventory/InventoryRequests')))}
              </React.Suspense>
            } />
          </Route>
        </Route>
        <Route path="*" element={<div>Página en construcción</div>} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
