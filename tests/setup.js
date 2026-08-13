// Vitest global setup. Registers fake-indexeddb globally so
// idb-keyval-backed modules (@/pwa/offline-store) work under happy-dom,
// which doesn't ship its own IndexedDB implementation.
import 'fake-indexeddb/auto';
