import React from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { NetworkAnalysisResult } from '@shared/types';

/**
 * Network visualization page component
 * Displays network analysis for a given BlueSky handle
 */
const NetworkPage: React.FC = () => {
  const { handle } = useParams<{ handle: string }>();
  const [networkData, setNetworkData] = React.useState<NetworkAnalysisResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [jobId, setJobId] = React.useState<string | null>(null);

  // Function to start network analysis
  const startAnalysis = async () => {
    if (!handle) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/network/analyze/${handle}`, {
        method: 'POST',
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to start analysis');
      }

      if (data.jobId) {
        setJobId(data.jobId);
        pollJobStatus(data.jobId);
      } else if (data.stats) {
        // If we got data directly (from cache)
        setNetworkData(data);
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  // Function to poll job status
  const pollJobStatus = async (id: string) => {
    try {
      const response = await fetch(`/api/network/analysis/${handle}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch analysis');
      }

      if (data.stats) {
        setNetworkData(data);
        setLoading(false);
        setJobId(null);
      } else {
        // Continue polling
        setTimeout(() => pollJobStatus(id), 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
      setJobId(null);
    }
  };

  // Start analysis on component mount
  React.useEffect(() => {
    startAnalysis();
  }, [handle]);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Network Analysis for @{handle}
          </h1>
          <button
            className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            onClick={startAnalysis}
            disabled={loading}
          >
            {loading ? 'Analyzing...' : 'Refresh Analysis'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {loading && (
          <div className="w-full h-[600px] bg-white rounded-lg shadow-lg border border-gray-200 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
              <p className="text-gray-500">Analyzing network data...</p>
              {jobId && <p className="text-sm text-gray-400 mt-2">Job ID: {jobId}</p>}
            </div>
          </div>
        )}

        {!loading && networkData && (
          <div className="space-y-6">
            {/* Network Stats */}
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Followers</h3>
                <p className="text-3xl font-bold text-primary-600">{networkData.stats.followers}</p>
              </div>
              <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Following</h3>
                <p className="text-3xl font-bold text-primary-600">{networkData.stats.following}</p>
              </div>
              <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Mutual Connections</h3>
                <p className="text-3xl font-bold text-primary-600">{networkData.stats.mutuals}</p>
              </div>
            </div>

            {/* Communities */}
            <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Communities</h2>
              <div className="space-y-4">
                {networkData.communities.map((community) => (
                  <div key={community.id} className="border-b border-gray-200 pb-4 last:border-0">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-lg font-semibold text-gray-700">
                        Community {community.id.split('-')[1]}
                      </h3>
                      <span className="text-sm text-gray-500">{community.size} members</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                      <div>
                        <span className="font-medium">Density:</span>{' '}
                        {((community.metrics?.density ?? 0) * 100).toFixed(2)}%
                      </div>
                      <div>
                        <span className="font-medium">Cohesion:</span>{' '}
                        {((community.metrics?.cohesion ?? 0) * 100).toFixed(2)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Last Updated */}
            <div className="text-sm text-gray-500 text-right">
              Last updated: {new Date(networkData.lastUpdated).toLocaleString()}
            </div>
          </div>
        )}

        {!loading && !networkData && !error && (
          <div className="w-full h-[600px] bg-white rounded-lg shadow-lg border border-gray-200 flex items-center justify-center">
            <p className="text-gray-500">No network data available</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default NetworkPage;
