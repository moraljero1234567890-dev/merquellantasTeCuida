'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import DashboardNavbar from '../navbar';
import { ChevronRight } from 'lucide-react';
import PermisoForm from './permiso';
import IncapacidadForm from './incapacidad';
import VacacionesForm from './vacaciones';

const VALID_TIPOS = new Set(['permiso', 'incapacidad', 'vacaciones']);

const SolicitudPageInner = () => {
  const params = useSearchParams();
  const initialTipo = params.get('tipo');
  const [requestType, setRequestType] = useState(
    initialTipo && VALID_TIPOS.has(initialTipo) ? initialTipo : 'permiso'
  );

  const renderForm = () => {
    switch (requestType) {
      case 'permiso':
        return <PermisoForm />;
      case 'incapacidad':
        return <IncapacidadForm />;
      case 'vacaciones':
        return <VacacionesForm />;
      default:
        return <PermisoForm />;
    }
  };

  return (
    <div className="min-h-screen bg-white text-black">
      <DashboardNavbar activePage='permisos' />
      
      <main className="max-w-4xl mx-auto pt-24 pb-12 px-4 sm:px-6">
        {/* Page header with breadcrumbs */}
        <div className="mb-8">
          <div className="flex items-center text-sm text-gray-500 mb-2">
            <a href="/dashboard" className="hover:text-gray-700">Inicio</a>
            <ChevronRight className="h-4 w-4 mx-1" />
            <span className="text-[#f4a900] font-medium">Nueva Solicitud</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Nueva Solicitud</h1>
          <p className="mt-2 text-gray-600">Complete el formulario para enviar su solicitud</p>
        </div>

        {/* Tab Navigation */}
        <div className="mb-8">
          <div className="bg-gray-100 rounded-xl p-1 flex flex-col sm:flex-row max-w-md mx-auto">
            <button
              type="button"
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all mb-1 sm:mb-0 sm:mr-1 ${
                requestType === 'permiso' 
                  ? 'bg-white text-[#f4a900] shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setRequestType('permiso')}
            >
              Permiso
            </button>
            <button
              type="button"
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all mb-1 sm:mb-0 sm:mx-0.5 ${
                requestType === 'incapacidad' 
                  ? 'bg-white text-[#f4a900] shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setRequestType('incapacidad')}
            >
              Incapacidad
            </button>
            <button
              type="button"
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all sm:ml-1 ${
                requestType === 'vacaciones' 
                  ? 'bg-white text-[#f4a900] shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setRequestType('vacaciones')}
            >
              Vacaciones
            </button>
          </div>
        </div>

        {renderForm()}
      </main>
    </div>
  );
};

const SolicitudPage = () => (
  <Suspense fallback={null}>
    <SolicitudPageInner />
  </Suspense>
);

export default SolicitudPage;