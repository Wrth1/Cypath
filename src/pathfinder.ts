import { type NetworkGraph, type GraphNode } from './graphParser';

interface AdjacencyList {
  [nodeId: number]: { target: number; distance: number }[];
}

export class Pathfinder {
  private adjacencyList: AdjacencyList = {};
  private nodesMap: Map<number, GraphNode> = new Map();

  constructor(graph: NetworkGraph) {
    this.buildGraph(graph);
  }

  private buildGraph(graph: NetworkGraph) {
    graph.nodes.forEach(node => {
      this.adjacencyList[node.id] = [];
      this.nodesMap.set(node.id, node);
    });

    graph.edges.forEach(edge => {
      // In the graph JSON, similarity score is stored. Higher score = more similar.
      // For pathfinding, we want distance. So we invert it: distance = 1 / weight
      // If weight is 0, distance is Infinity.
      const distance = edge.weight > 0 ? 1 / edge.weight : Infinity;

      // Add edge in both directions because the graph is undirected
      this.adjacencyList[edge.source]?.push({ target: edge.target, distance });
      this.adjacencyList[edge.target]?.push({ target: edge.source, distance });
    });
  }

  /**
   * Finds the shortest path from any of the startNodes to the targetNode using Dijkstra's Algorithm
   */
  public findShortestPath(startNodeIds: number[], targetNodeId: number): GraphNode[] {
    if (startNodeIds.length === 0 || targetNodeId === null || targetNodeId === undefined) {
      return [];
    }

    // Min-priority queue logic (simplified with an array since graph isn't massive, but could be optimized)
    const distances = new Map<number, number>();
    const previous = new Map<number, number | null>();
    const unvisited = new Set<number>();

    // Initialize distances
    this.nodesMap.forEach((_, id) => {
      distances.set(id, Infinity);
      previous.set(id, null);
      unvisited.add(id);
    });

    // Start nodes have 0 distance
    startNodeIds.forEach(id => {
      distances.set(id, 0);
    });

    while (unvisited.size > 0) {
      // Find the unvisited node with the smallest distance
      let minNodeId: number | null = null;
      let minDistance = Infinity;

      for (const id of unvisited) {
        const dist = distances.get(id)!;
        if (dist < minDistance) {
          minDistance = dist;
          minNodeId = id;
        }
      }

      if (minNodeId === null || minDistance === Infinity) {
        break; // All remaining nodes are unreachable
      }

      if (minNodeId === targetNodeId) {
        break; // Found the target
      }

      unvisited.delete(minNodeId);

      // Check neighbors
      const neighbors = this.adjacencyList[minNodeId] || [];
      for (const neighbor of neighbors) {
        if (!unvisited.has(neighbor.target)) continue;

        const newDist = minDistance + neighbor.distance;
        if (newDist < distances.get(neighbor.target)!) {
          distances.set(neighbor.target, newDist);
          previous.set(neighbor.target, minNodeId);
        }
      }
    }

    // Reconstruct path
    const path: GraphNode[] = [];
    let current: number | null = targetNodeId;

    while (current !== null) {
      path.unshift(this.nodesMap.get(current)!);
      
      // If we've reached one of the start nodes, stop.
      if (startNodeIds.includes(current)) {
        break;
      }
      
      current = previous.get(current) || null;
    }

    // If the first node in path is not one of our start nodes, it means no path was found
    if (path.length > 0 && !startNodeIds.includes(path[0].id)) {
      return [];
    }

    return path;
  }
}
