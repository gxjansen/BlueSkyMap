import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Main layout component that provides consistent structure across all pages
 */
const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Link to="/" className="text-xl font-semibold text-primary-600">
              BlueSky Network Visualizer
            </Link>
            <div className="space-x-4">
              <Link to="/" className="text-gray-600 hover:text-primary-600">
                Home
              </Link>
              <Link to="/network" className="text-gray-600 hover:text-primary-600">
                Network
              </Link>
            </div>
          </div>
        </div>
      </nav>
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
};

export default Layout;
