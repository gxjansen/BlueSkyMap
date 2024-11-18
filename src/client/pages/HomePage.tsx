import React from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';

/**
 * Home page component that serves as the landing page
 */
const HomePage: React.FC = () => {
  return (
    <Layout>
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-6">
          Welcome to BlueSky Network Visualizer
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Explore and visualize your BlueSky social network with interactive 3D graphics.
          Discover connections, analyze relationships, and gain insights into your social graph.
        </p>
        <Link
          to="/network"
          className="inline-block bg-primary-600 text-white px-8 py-3 rounded-lg hover:bg-primary-700 transition-colors"
        >
          Explore Your Network
        </Link>
      </div>
    </Layout>
  );
};

export default HomePage;
