/**
 * Detects whether adding an edge from `from` to `to` would create a cycle in
 * the directed graph represented by the existing edges.
 */
export function wouldCreateCycle(
  edges: Array<{ from: string; to: string }>,
  from: string,
  to: string,
): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const successors = adjacency.get(edge.from) ?? [];
    successors.push(edge.to);
    adjacency.set(edge.from, successors);
  }

  const visited = new Set<string>();
  const pending = [to];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === from) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(adjacency.get(current) ?? []));
  }

  return false;
}
