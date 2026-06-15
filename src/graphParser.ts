/**
 * Represents a node in the reconstructed network graph.
 */
export interface GraphNode {
  id: number;
  label: string;
  clusterId: number | null;
}

/**
 * Represents an undirected edge in the reconstructed network graph.
 */
export interface GraphEdge {
  source: number;
  target: number;
  weight: number;
}

/**
 * The complete reconstructed network graph.
 */
export interface NetworkGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Fetches and parses the highly compressed JSON files to reconstruct the network graph.
 * 
 * @param labelsUrl - URL to web_labels.json
 * @param clustersUrl - URL to web_clusters.json
 * @param similaritiesUrl - URL to web_similarities.json
 * @returns The fully reconstructed nodes and edges
 */
export async function loadAndParseGraph(
  labelsUrl: string,
  clustersUrl: string,
  similaritiesUrl: string
): Promise<NetworkGraph> {
  
  // 1. Fetch all data in parallel
  const [labelsRes, clustersRes, similaritiesRes] = await Promise.all([
    fetch(labelsUrl),
    fetch(clustersUrl),
    fetch(similaritiesUrl)
  ]);

  if (!labelsRes.ok || !clustersRes.ok || !similaritiesRes.ok) {
    throw new Error('Failed to fetch one or more graph data files.');
  }

  const labels: string[] = await labelsRes.json();
  const clusters: number[][] = await clustersRes.json();
  const similarities: number[][] = await similaritiesRes.json();

  return parseGraphData(labels, clusters, similarities);
}

/**
 * Parses the raw arrays into a structured graph format.
 * 
 * @param labels - Array of strings where index = node ID
 * @param clusters - Array of arrays of node IDs, where outer index = cluster ID
 * @param similarities - Flattened similarity arrays per node ID
 * @returns The fully reconstructed nodes and edges
 */
export function parseGraphData(
  labels: string[],
  clusters: number[][],
  similarities: number[][]
): NetworkGraph {
  // Step 1: Parse Nodes (web_labels.json)
  // The index of the string is the unique integer ID for that node.
  const nodes: GraphNode[] = labels.map((label, index) => ({
    id: index,
    label: label,
    clusterId: null // Default to null, will be populated next
  }));

  // Step 2: Parse Clusters (web_clusters.json)
  // Each inner array is a cluster, integers are node IDs.
  clusters.forEach((clusterNodes, clusterIndex) => {
    clusterNodes.forEach((nodeId) => {
      if (nodes[nodeId]) {
        nodes[nodeId].clusterId = clusterIndex;
      }
    });
  });

  // Step 3: Parse Edges/Similarities (web_similarities.json)
  const edges: GraphEdge[] = [];
  
  similarities.forEach((innerArray, id1) => {
    if (!innerArray || innerArray.length === 0) {
      return; // No outward edges stored for id1
    }

    // Iterate through the inner array in steps of 2
    for (let i = 0; i < innerArray.length; i += 2) {
      const id2 = innerArray[i];
      const score = innerArray[i + 1];
      
      // Convert integer percentage (e.g., 85) to float (0.85)
      const weight = score / 100.0;

      // We drop weak edges (similarity <= 50%) to drastically improve memory 
      // and CPU performance, turning an unreadable 1M edge hairball into 
      // a clean 13k edge graph of strong semantic relationships.
      if (weight > 0.50) {
        edges.push({
          source: id1,
          target: id2,
          weight: weight
        });
      }
    }
  });

  return {
    nodes,
    edges
  };
}
