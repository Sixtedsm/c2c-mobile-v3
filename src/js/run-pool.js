// Calls `fn` on every item, with at most `size` calls in flight at once.
// As soon as one finishes the next item starts, so a single slow request
// does not hold back a whole batch. `fn` is expected not to throw: a
// rejection would end the pool early.
export default async function runPool(items, fn, size) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      await fn(items[next++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}
