import React from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import NetworkGraph from '../components/NetworkGraph';
import ProgressOverlay from '../components/ProgressOverlay';
import { NetworkAnalysisResult, NetworkData, NetworkNode, NetworkEdge, AnalysisProgress } from '@shared/types';

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
  const [progress, setProgress] = React.useState<AnalysisProgress | null>(null);
  const [pollInterval, setPollInterval] = React.useState<number>(2000);
  const [selectedCommunity, setSelectedCommunity] = React.useState<string | null>(null);
  const pollTimeoutRef = React.useRef<number>();

  // Convert analysis result to graph data
  const graphData: NetworkData | null = React.useMemo(() => {
    if (!networkData) return null;

    const nodes = new Map<string, NetworkNode>();
    const graphEdges: NetworkEdge[] = [];

    // Add central user node
    const centralNode: NetworkNode = {
      id: networkData.userId,
      type: 'user',
      data: {
        did: networkData.userId,
        handle: networkData.handle,
        displayName: networkData.handle
      }
    };
    nodes.set(networkData.userId, centralNode);

    // Process communities and their connections
    networkData.communities.forEach(community => {
      // Only process selected community or all communities if none selected
      if (selectedCommunity && community.id !== selectedCommunity) return;

      // First pass: create nodes
      community.members.forEach(memberId => {
        if (!nodes.has(memberId)) {
          nodes.set(memberId, {
            id: memberId,
            type: 'user',
            data: {
              did: memberId,
              handle: memberId,
              displayName: memberId
            }
          });
        }
      });

      // Second pass: create edges only between existing nodes
      community.members.forEach(memberId => {
        if (nodes.has(memberId)) {
          // Add edge to central node
          graphEdges.push({
            source: networkData.userId,
            target: memberId,
            type: 'mutual'
          });

          // Add edges between community members, but limit to central nodes
          if (community.centralNodes?.includes(memberId)) {
            community.members.forEach(otherMemberId => {
              if (memberId !== otherMemberId && 
                  community.centralNodes?.includes(otherMemberId) &&
                  nodes.has(otherMemberId)) {
                graphEdges.push({
                  source: memberId,
                  target: otherMemberId,
                  type: 'mutual'
                });
              }
            });
          }
        }
      });
    });

    return {
      nodes: Array.from(nodes.values()),
      edges: graphEdges
    };
  }, [networkData, selectedCommunity]);

  // Calculate network insights
  const networkInsights = React.useMemo(() => {
    if (!networkData) return null;

    const totalConnections = networkData.stats.mutuals;
    const avgConnectionsPerCommunity = totalConnections / networkData.communities.length;
    const largestCommunity = Math.max(...networkData.communities.map(c => c.size));
    const avgDensity = networkData.communities.reduce((acc, c) => acc + (c.metrics?.density || 0), 0) / networkData.communities.length;

    return {
      totalConnections,
      avgConnectionsPerCommunity,
      largestCommunity,
      avgDensity,
      communitiesCount: networkData.communities.length
    };
  }, [networkData]);

  // Function to start network analysis
  const startAnalysis = async (force = false) => {
    if (!handle) return;
    setLoading(true);
    setError(null);
    setProgress(null);
    setNetworkData(null); // Clear existing data

    try {
      // Clear all caches when forcing refresh
      if (force) {
        await fetch(`/api/network/clear-cache/${handle}`, {
          method: 'POST'
        });
      }

      const response = await fetch(`/api/network/analyze/${handle}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ force })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to start analysis');
      }

      if (data.jobId) {
        setJobId(data.jobId);
        setPollInterval(2000);
        pollJobStatus();
      } else if (data.stats) {
        setNetworkData(data);
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  // Function to poll job status with improved error handling
  const pollJobStatus = async () => {
    if (!handle) return;

    try {
      const response = await fetch(`/api/network/analysis/${handle}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch analysis');
      }

      // Check for progress or final result
      if (data.progress) {
        setProgress(data.progress);
        
        // Continue polling if not complete
        if (data.progress.stage !== 'completed' && data.progress.stage !== 'error') {
          pollTimeoutRef.current = window.setTimeout(pollJobStatus, pollInterval);
          setPollInterval(prev => Math.min(prev * 1.2, 10000)); // Slightly gentler backoff
        }
      }

      // Check for final result
      if (data.stats) {
        setNetworkData(data);
        setLoading(false);
        setJobId(null);
        setProgress(null);
        
        // Clear any pending timeout
        if (pollTimeoutRef.current) {
          window.clearTimeout(pollTimeoutRef.current);
        }
      }
    } catch (err) {
      console.error('Polling error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred during polling');
      setLoading(false);
      setJobId(null);
      setProgress(null);
      
      // Clear any pending timeout
      if (pollTimeoutRef.current) {
        window.clearTimeout(pollTimeoutRef.current);
      }
    }
  };

  // Cleanup polling on unmount
  React.useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) {
        window.clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  // Start analysis on component mount
  React.useEffect(() => {
    startAnalysis();
  }, [handle]);

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Network Analysis for @{handle}
            </h1>
            {networkData && (
              <p className="text-gray-500 mt-1">
                Analyzing connections across {networkInsights?.communitiesCount} communities
              </p>
            )}
          </div>
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => startAnalysis(true)}
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

        {loading && progress && (
          <ProgressOverlay
            stage={progress.stage}
            message={progress.message}
            current={progress.current}
            total={progress.total}
            details={progress.details}
          />
        )}

        {loading && !progress && (
          <div className="w-full h-[600px] bg-white rounded-lg shadow-lg border border-gray-200 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-500">Starting analysis...</p>
              {jobId && <p className="text-sm text-gray-400 mt-2">Job ID: {jobId}</p>}
            </div>
          </div>
        )}

        {!loading && networkData && (
          <div className="space-y-6">
            {/* Network Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-1">Followers</h3>
                <p className="text-3xl font-bold text-blue-600">{networkData.stats.followers}</p>
                <div className="mt-2 text-sm text-gray-600">
                  Following: {networkData.stats.following}
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-1">Mutual Connections</h3>
                <p className="text-3xl font-bold text-blue-600">{networkData.stats.mutuals}</p>
                <div className="mt-2 text-sm text-gray-600">
                  Across {networkInsights?.communitiesCount} communities
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-1">Largest Community</h3>
                <p className="text-3xl font-bold text-blue-600">{networkInsights?.largestCommunity}</p>
                <div className="mt-2 text-sm text-gray-600">
                  Avg: {Math.round(networkInsights?.avgConnectionsPerCommunity || 0)} connections
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-1">Network Density</h3>
                <p className="text-3xl font-bold text-blue-600">
                  {((networkInsights?.avgDensity || 0) * 100).toFixed(1)}%
                </p>
                <div className="mt-2 text-sm text-gray-600">
                  Average across communities
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Communities Panel */}
              <div className="lg:col-span-1">
                <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Communities</h2>
                  <div className="space-y-4">
                    {networkData.communities.map((community) => (
                      <div 
                        key={community.id} 
                        className={`
                          border rounded-lg p-4 cursor-pointer transition-all
                          ${selectedCommunity === community.id 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                          }
                        `}
                        onClick={() => setSelectedCommunity(
                          selectedCommunity === community.id ? null : community.id
                        )}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            Community {community.id.split('-')[1]}
                          </h3>
                          <span className="px-2 py-1 text-sm bg-gray-100 text-gray-600 rounded">
                            {community.size} members
                          </span>
                        </div>
                        <div className="space-y-2 text-sm text-gray-600">
                          <div className="flex justify-between">
                            <span className="font-medium">Density:</span>
                            <span>{((community.metrics?.density ?? 0) * 100).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium">Cohesion:</span>
                            <span>{((community.metrics?.cohesion ?? 0) * 100).toFixed(1)}%</span>
                          </div>
                          {community.centralNodes && (
                            <div className="flex justify-between">
                              <span className="font-medium">Central Members:</span>
                              <span>{community.centralNodes.length}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Network Visualization */}
              <div className="lg:col-span-2">
                {graphData && (
                  <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
                    <div className="h-[800px]">
                      <NetworkGraph data={graphData} />
                    </div>
                  </div>
                )}
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
