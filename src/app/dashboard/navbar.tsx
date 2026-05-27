import React, { useState, useEffect } from 'react';
import { Menu, X, User2, Home, FileText, ChevronDown, LogOut, HelpCircle, Palmtree, HeartPlus, Landmark, GraduationCap } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const DashboardNavbar = ({ activePage = 'home' }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const router = useRouter();
  const { data: session } = useSession();

  const profile = session ? {
    nombre: session.user.nombre,
    rol: session.user.rol,
  } : null;

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/auth/login' });
  };

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isProfileOpen && !(event.target as Element)?.closest('#profile-menu')) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isProfileOpen]);

  // Navigation items configuration
  const allNavItems = [
    { id: 'home', href: '/dashboard', icon: <Home size={18} />, label: 'Inicio' },
    { id: 'cesantias', href: '/dashboard/cesantias', icon: <HeartPlus size={18} />, label: 'Cesantías' },
    { id: 'permisos', href: '/dashboard/solicitud', icon: <Palmtree size={18} />, label: 'Permisos' },
    { id: 'documentos', href: '/dashboard/documents', icon: <FileText size={18} />, label: 'Documentos' },
    { id: 'pqrsf', href: '/dashboard/pqrsf', icon: <HelpCircle size={18} />, label: 'PQRSF' },
    { id: 'fondo', href: '/dashboard/fondo', icon: <Landmark size={18} />, label: 'Fonalmerque' },
    { id: 'elearning', href: '/dashboard/elearning', icon: <GraduationCap size={18} />, label: 'E-Learning' },
  ];

  const navItems = profile?.rol === 'externo'
    ? allNavItems.filter((item) => item.id === 'fondo')
    : allNavItems;

  return (
    <div>
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled ? 'bg-white/95 backdrop-blur-md shadow-sm' : 'bg-white shadow-sm'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Logo y botón de menú móvil */}
            <div className="flex items-center">
              <button
                className="md:hidden p-2 mr-2 rounded-full text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#f4a900]"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <a href="/dashboard" className="flex items-center">
                <img
                  src="https://www.merquellantas.com/assets/images/logo/Logo-Merquellantas.png"
                  alt="Merquellantas Logo"
                  className="h-8 sm:h-10 w-auto"
                />
              </a>
            </div>

            {/* Navegación de escritorio */}
            <div className="hidden md:flex items-center justify-center flex-1 ml-10">
              <div className="flex space-x-1">
                {navItems.map(item => (
                  <NavItem
                    key={item.id}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    active={activePage === item.id}
                  />
                ))}
              </div>
            </div>

            {/* Perfil de usuario */}
            <div className="flex items-center">
              <div className="relative" id="profile-menu">
                <button
                  className="flex items-center space-x-2 p-2 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#f4a900]"
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                >
                  <div className="h-8 w-8 rounded-full bg-gradient-to-r from-[#f4a900] to-[#f4a900] flex items-center justify-center text-white">
                    <User2 className="h-5 w-5" />
                  </div>
                  <ChevronDown className="h-4 w-4 text-gray-500 hidden sm:block" />
                </button>

                {/* Menú desplegable de perfil */}
                {isProfileOpen && (
                  <div className="origin-top-right absolute right-0 mt-2 w-64 rounded-xl shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none transition transform">
                    <div className="py-4 px-4 border-b border-gray-100">
                      <div className="flex items-center space-x-3">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-r from-[#f4a900] to-[#f4a900] flex items-center justify-center text-white">
                          <User2 className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{profile?.nombre ?? 'Cargando...'}</p>
                        </div>
                      </div>
                    </div>
                    <div className="py-1">
                      <button
                        onClick={handleLogout}
                        className="flex items-center px-4 py-2 text-sm hover:bg-gray-50 transition-colors duration-150 text-gray-700"
                      >
                        <LogOut size={16} className="mr-3 opacity-70" />
                        Cerrar Sesión
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Menú móvil */}
        {isMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 shadow-lg animate-fadeIn">
            <div className="py-3 px-2 space-y-1">
              {navItems.map(item => (
                <MobileNavItem
                  key={item.id}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  active={activePage === item.id}
                />
              ))}
            </div>
            <div className="border-t border-gray-100 pt-4 pb-3">
              <div className="flex items-center px-4">
                <div className="flex-shrink-0">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-r from-[#f4a900] to-[#f4a900] flex items-center justify-center text-white">
                    <User2 className="h-6 w-6" />
                  </div>
                </div>
                <div className="ml-3">
                  <div className="text-base font-medium text-gray-800">{profile?.nombre ?? 'Cargando...'}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </nav>
    </div>
  );
};

// Interface for navigation item props
interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}

// Componente para ítems de navegación en escritorio
const NavItem: React.FC<NavItemProps> = ({ href, icon, label, active = false }) => {
  return (
    <a
      href={href}
      className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
        active
          ? 'text-[#f4a900] bg-[#f4a900]/10 shadow-sm'
          : 'text-gray-600 hover:text-[#f4a900] hover:bg-gray-50'
      }`}
    >
      <span className="mr-2">{icon}</span>
      {label}
    </a>
  );
};

// Componente para ítems de navegación en móvil
const MobileNavItem: React.FC<NavItemProps> = ({ href, icon, label, active = false }) => {
  return (
    <a
      href={href}
      className={`flex items-center px-3 py-3 text-base font-medium rounded-lg transition-all duration-200 ${
        active
          ? 'text-[#f4a900] bg-[#f4a900]/10 shadow-sm'
          : 'text-gray-600 hover:text-[#f4a900] hover:bg-gray-50'
      }`}
    >
      <span className="mr-3">{icon}</span>
      {label}
    </a>
  );
};

export default DashboardNavbar;
