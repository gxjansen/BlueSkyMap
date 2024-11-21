import { 
  NetworkNode, 
  NetworkEdge, 
  NetworkData, 
  Community, 
  ConnectionData,
  ConnectionType 
} from '../../shared/types';

/**
 * Graph Processor Service
 * Handles network graph creation and analysis
 */
class GraphProcessor {
  // Edge weights for different connection types
  private readonly EDGE_WEIGHTS = {
    follows: 1,
    mutual: 2
  };

  /**
   * Create network graph structure from connection data
   */
  createGraph(
    userId: string,
    followers: ConnectionData[],
    following: ConnectionData[],
    mutuals: ConnectionData[],
    additionalEdges?: { source: string; target: string }[]
  ): NetworkData {
    console.log('Creating graph with:', {
      userId,
      followersCount: followers?.length || 0,
      followingCount: following?.length || 0,
      mutualsCount: mutuals?.length || 0,
      additionalEdgesCount: additionalEdges?.length || 0
    });

    const nodes = new Map<string, NetworkNode>();
    const edges: NetworkEdge[] = [];

    // Helper to add node if not exists
    const addNode = (connection: ConnectionData) => {
      if (!connection?.connectionId) {
        console.log('Skipping connection without connectionId');
        return;
      }
      
      if (!nodes.has(connection.connectionId)) {
        nodes.set(connection.connectionId, {
          id: connection.connectionId,
          type: 'user',
          data: {
            did: connection.connectionId,
            handle: connection.profile?.handle || '',
            displayName: connection.profile?.displayName || ''
          }
        });
      }
    };

    // Add central user node
    const centralNode: NetworkNode = {
      id: userId,
      type: 'user',
      data: {
        did: userId,
        handle: mutuals?.[0]?.profile?.handle || userId,
        displayName: mutuals?.[0]?.profile?.displayName || userId
      }
    };
    nodes.set(userId, centralNode);

    // Process mutual followers
    if (Array.isArray(mutuals)) {
      mutuals.forEach(mutual => {
        if (!mutual?.connectionId) {
          console.log('Skipping mutual without connectionId');
          return;
        }
        addNode(mutual);
      });

      // Add edges only after all nodes are created
      mutuals.forEach(mutual => {
        if (!mutual?.connectionId || !nodes.has(mutual.connectionId)) {
          return;
        }
        edges.push({
          source: userId,
          target: mutual.connectionId,
          type: 'mutual'
        });
      });
    }

    // Add additional edges between mutual followers only if both nodes exist
    if (additionalEdges) {
      additionalEdges.forEach(edge => {
        if (!edge?.source || !edge?.target) {
          console.log('Skipping edge without source or target');
          return;
        }
        if (!nodes.has(edge.source) || !nodes.has(edge.target)) {
          console.log(`Skipping edge between non-existent nodes: ${edge.source} -> ${edge.target}`);
          return;
        }
        edges.push({
          source: edge.source,
          target: edge.target,
          type: 'mutual'
        });
      });
    }

    const result = {
      nodes: Array.from(nodes.values()),
      edges: edges.filter(edge => 
        edge?.source && 
        edge?.target && 
        nodes.has(edge.source) && 
        nodes.has(edge.target)
      )
    };

    console.log('Created graph with:', {
      nodes: result.nodes.length,
      edges: result.edges.length
    });

    return result;
  }

  /**
   * Calculate modularity score for a given community structure
   */
  private calculateModularity(
    communities: Community[],
    nodeMap: Map<string, number>,
    adjacencyMap: Map<string, Set<string>>,
    totalEdges: number
  ): number {
    let modularity = 0;
    const degreeMap = new Map<string, number>();

    // Calculate node degrees
    adjacencyMap.forEach((neighbors, nodeId) => {
      degreeMap.set(nodeId, neighbors.size);
    });

    // Calculate modularity
    communities.forEach(community => {
      community.members.forEach(nodeI => {
        community.members.forEach(nodeJ => {
          if (nodeI === nodeJ) return;

          const actualConnection = adjacencyMap.get(nodeI)?.has(nodeJ) ? 1 : 0;
          const expectedConnection = (degreeMap.get(nodeI) || 0) * (degreeMap.get(nodeJ) || 0) / (2 * totalEdges);
          
          modularity += actualConnection - expectedConnection;
        });
      });
    });

    return modularity / (2 * totalEdges);
  }

  /**
   * Calculate the change in modularity if a node moves to a new community
   */
  private calculateModularityGain(
    node: string,
    fromCommunity: number,
    toCommunity: number,
    communities: Community[],
    nodeMap: Map<string, number>,
    adjacencyMap: Map<string, Set<string>>,
    totalEdges: number
  ): number {
    const neighbors = adjacencyMap.get(node) || new Set();
    let gain = 0;

    // Calculate connections to target community
    const connectionsTo = Array.from(neighbors)
      .filter(neighbor => nodeMap.get(neighbor) === toCommunity)
      .length;

    // Calculate connections to current community
    const connectionsFrom = Array.from(neighbors)
      .filter(neighbor => nodeMap.get(neighbor) === fromCommunity)
      .length;

    // Calculate community sizes
    const fromSize = communities[fromCommunity].size - 1;
    const toSize = communities[toCommunity].size + 1;

    // Calculate modularity gain using the formula from the Louvain method
    gain = (connectionsTo / totalEdges) - 
           (connectionsFrom / totalEdges) * 
           ((fromSize * toSize) / Math.pow(2 * totalEdges, 2));

    return gain;
  }

  /**
   * Detect communities using the enhanced Louvain method
   */
  detectCommunities(graph: NetworkData): Community[] {
    if (!graph?.nodes?.length || !graph?.edges?.length) {
      console.log('No nodes or edges in graph, returning empty communities array');
      return [];
    }

    console.log('Detecting communities for graph with:', {
      nodes: graph.nodes.length,
      edges: graph.edges.length
    });

    const communities: Community[] = [];
    const nodeMap = new Map<string, number>(); // node id to community id
    
    // Initialize each node in its own community
    graph.nodes.forEach((node, index) => {
      if (!node?.id) {
        console.log('Found node without id, skipping');
        return;
      }
      nodeMap.set(node.id, index);
      communities.push({
        id: `community-${index}`,
        size: 1,
        members: [node.id],
        metrics: {
          density: 0,
          cohesion: 0
        }
      });
    });

    // Create weighted adjacency map
    const adjacencyMap = new Map<string, Set<string>>();
    const totalEdges = graph.edges.length;
    
    graph.edges.forEach(edge => {
      if (!edge?.source || !edge?.target) {
        console.log('Found edge without source or target, skipping');
        return;
      }

      const weight = this.EDGE_WEIGHTS[edge.type];

      if (!adjacencyMap.has(edge.source)) {
        adjacencyMap.set(edge.source, new Set());
      }
      if (!adjacencyMap.has(edge.target)) {
        adjacencyMap.set(edge.target, new Set());
      }

      // Add weighted connections
      for (let i = 0; i < weight; i++) {
        adjacencyMap.get(edge.source)!.add(edge.target);
        adjacencyMap.get(edge.target)!.add(edge.source);
      }
    });

    // Merge communities based on modularity
    let changed = true;
    let iterations = 0;
    const MAX_ITERATIONS = 10;
    let bestModularity = this.calculateModularity(communities, nodeMap, adjacencyMap, totalEdges);

    while (changed && iterations < MAX_ITERATIONS) {
      changed = false;
      iterations++;
      
      // For each node
      graph.nodes.forEach(node => {
        if (!node?.id) {
          console.log('Found node without id during community detection, skipping');
          return;
        }

        const currentCommunity = nodeMap.get(node.id);
        if (typeof currentCommunity === 'undefined') {
          console.log(`No community found for node ${node.id}, skipping`);
          return;
        }

        const neighbors = adjacencyMap.get(node.id) || new Set();
        
        // Find the neighboring community with highest modularity gain
        const neighborCommunities = new Map<number, number>();
        neighbors.forEach(neighborId => {
          const neighborCommunity = nodeMap.get(neighborId);
          if (typeof neighborCommunity === 'undefined') return;

          neighborCommunities.set(
            neighborCommunity,
            (neighborCommunities.get(neighborCommunity) || 0) + 1
          );
        });

        // Find best community to move to based on modularity gain
        let bestCommunity = currentCommunity;
        let maxGain = 0;

        neighborCommunities.forEach((_, communityId) => {
          if (communityId === currentCommunity) return;

          const gain = this.calculateModularityGain(
            node.id,
            currentCommunity,
            communityId,
            communities,
            nodeMap,
            adjacencyMap,
            totalEdges
          );

          if (gain > maxGain) {
            maxGain = gain;
            bestCommunity = communityId;
          }
        });

        // Move node to best community if it improves modularity
        if (bestCommunity !== currentCommunity && maxGain > 0) {
          // Remove from current community
          if (communities[currentCommunity]?.members) {
            communities[currentCommunity].members = 
              communities[currentCommunity].members.filter(id => id && id !== node.id);
            communities[currentCommunity].size = communities[currentCommunity].members.length;
          }

          // Add to new community
          if (communities[bestCommunity]?.members) {
            communities[bestCommunity].members.push(node.id);
            communities[bestCommunity].size = communities[bestCommunity].members.length;
            nodeMap.set(node.id, bestCommunity);
            changed = true;
          }
        }
      });

      // Calculate new modularity score
      const newModularity = this.calculateModularity(communities, nodeMap, adjacencyMap, totalEdges);
      console.log(`Iteration ${iterations}: modularity = ${newModularity}`);

      if (newModularity <= bestModularity) {
        break;
      }
      bestModularity = newModularity;
    }

    // Remove empty communities and calculate metrics
    const finalCommunities = communities
      .filter(community => community?.size > 0 && Array.isArray(community.members))
      .map(community => {
        // Calculate density (ratio of actual to possible connections)
        const possibleConnections = community.size * (community.size - 1) / 2;
        let actualConnections = 0;
        
        community.members.forEach(member => {
          if (!member) return;
          const neighbors = adjacencyMap.get(member) || new Set();
          actualConnections += Array.from(neighbors)
            .filter(neighbor => neighbor && community.members?.includes(neighbor)).length;
        });
        actualConnections /= 2; // Each edge was counted twice

        // Calculate cohesion (ratio of mutual to total connections)
        const mutualConnections = graph.edges.filter(edge => 
          edge?.type === 'mutual' &&
          edge?.source &&
          edge?.target &&
          community.members?.includes(edge.source) &&
          community.members?.includes(edge.target)
        ).length;

        community.metrics = {
          density: possibleConnections > 0 ? actualConnections / possibleConnections : 0,
          cohesion: actualConnections > 0 ? mutualConnections / actualConnections : 0
        };

        // Identify central nodes (nodes with highest number of connections within community)
        const nodeDegrees = new Map<string, number>();
        community.members.forEach(member => {
          if (!member) return;
          const neighbors = adjacencyMap.get(member) || new Set();
          nodeDegrees.set(member, 
            Array.from(neighbors)
              .filter(neighbor => neighbor && community.members?.includes(neighbor)).length
          );
        });

        community.centralNodes = Array.from(nodeDegrees.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([nodeId]) => nodeId);

        return community;
      });

    console.log('Detected communities:', {
      count: finalCommunities.length,
      modularity: bestModularity
    });

    return finalCommunities;
  }
}

// Create and export singleton instance
const graphProcessor = new GraphProcessor();
export default graphProcessor;
