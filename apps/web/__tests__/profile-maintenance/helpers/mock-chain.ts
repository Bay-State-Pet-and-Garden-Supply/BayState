/**
 * Shared mock builder for PostgREST query chains in Jest tests.
 *
 * Creates a thenable object that supports all common Supabase query methods
 * (select, eq, not, in, order, limit, single, maybeSingle, etc.)
 * When awaited, resolves with the given terminal value.
 */

export function makeChain<T extends { data: any; error: any; count?: number }>(terminalValue: T): any {
  const promise = Promise.resolve(terminalValue);
  const chain: Record<string, jest.Mock | Function> = {};

  const methods = [
    'select', 'eq', 'not', 'in', 'order', 'limit', 'range',
    'textSearch', 'single', 'maybeSingle', 'gte', 'lte', 'lt', 'gt',
  ];
  for (const m of methods) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }

  // Make chain thenable so `await supabase.from(...).select(...).eq(...)` resolves
  chain.then = promise.then.bind(promise);
  chain.catch = promise.catch.bind(promise);

  return chain;
}
