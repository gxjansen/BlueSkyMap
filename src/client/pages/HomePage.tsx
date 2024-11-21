import React from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';

const LoadingSpinner = () => (
  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

/**
 * Home page component that serves as the landing page
 */
const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [handle, setHandle] = React.useState('');
  const [error, setError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanHandle = handle.trim();
    
    if (!cleanHandle) {
      setError('Please enter a BlueSky handle');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/network/analyze/${cleanHandle}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('BlueSky API authentication failed. Please check server configuration.');
        }
        throw new Error(data.message || 'Failed to analyze network');
      }

      navigate(`/network/${cleanHandle}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render configuration instructions when there's an authentication error
  const renderAuthError = () => {
    if (!error.includes('authentication')) return null;
    
    return (
      <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-6 text-left">
        <h3 className="text-lg font-semibold text-red-800 mb-3">Configuration Required</h3>
        <p className="text-red-700 mb-4">
          The server needs proper BlueSky API credentials to function. Follow these steps to configure:
        </p>
        <ol className="list-decimal list-inside space-y-3 text-red-700">
          <li>
            <span className="font-medium">Create an App Password:</span>
            <ul className="ml-6 mt-1 list-disc text-sm">
              <li>Go to your BlueSky account settings</li>
              <li>Navigate to "App Passwords"</li>
              <li>Create a new app password</li>
            </ul>
          </li>
          <li>
            <span className="font-medium">Update Server Configuration:</span>
            <ul className="ml-6 mt-1 list-disc text-sm">
              <li>Locate the .env file in the server directory</li>
              <li>Set BSKY_IDENTIFIER to your BlueSky handle</li>
              <li>Set BSKY_APP_PASSWORD to your newly created app password</li>
            </ul>
          </li>
          <li>
            <span className="font-medium">Restart the Server:</span>
            <ul className="ml-6 mt-1 list-disc text-sm">
              <li>Stop the current server process</li>
              <li>Run npm run dev to start with new credentials</li>
            </ul>
          </li>
        </ol>
      </div>
    );
  };

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

        {/* Development Notice */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-yellow-800 mb-2">⚠️ Development Version</h2>
          <p className="text-yellow-800 mb-4">
            This is a development version that requires proper BlueSky API credentials to function.
          </p>
          <div className="text-sm text-yellow-700 text-left">
            <p className="mb-2">To run this application, you need:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>A BlueSky account</li>
              <li>An App Password from your BlueSky account settings</li>
              <li>Configure these credentials in the server's .env file</li>
            </ol>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-4">
          <div className="flex flex-col gap-4">
            <div className="relative">
              <input
                type="text"
                value={handle}
                onChange={(e) => {
                  setHandle(e.target.value);
                  if (error) setError(''); // Clear error when user types
                }}
                placeholder="Enter BlueSky handle (e.g., user.bsky.social)"
                className={`
                  w-full px-4 py-3 rounded-lg border transition-colors duration-200
                  ${error ? 'border-red-300 bg-red-50' : 'border-gray-300'}
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  disabled:bg-gray-50 disabled:cursor-not-allowed
                `}
                disabled={isSubmitting}
                aria-invalid={error ? 'true' : 'false'}
                aria-describedby={error ? 'error-message' : undefined}
              />
            </div>

            <div className="relative h-12">
              <button
                type="submit"
                disabled={!handle.trim() || isSubmitting}
                className={`
                  absolute inset-0 w-full rounded-lg font-medium text-white
                  transition-all duration-200
                  ${!handle.trim() 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : isSubmitting
                      ? 'bg-blue-600 cursor-wait'
                      : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
                  }
                  disabled:opacity-50
                `}
              >
                <span className={`
                  absolute inset-0 flex items-center justify-center
                  transition-opacity duration-200
                  ${isSubmitting ? 'opacity-0' : 'opacity-100'}
                `}>
                  Explore Network
                </span>
                {isSubmitting && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <LoadingSpinner />
                  </span>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div 
              id="error-message"
              role="alert"
              className="mt-4"
            >
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-left">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-red-400 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <p className="text-red-700 font-medium">{error}</p>
                </div>
              </div>
              {renderAuthError()}
            </div>
          )}
        </form>
      </div>
    </Layout>
  );
};

export default HomePage;
