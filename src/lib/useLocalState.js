import { useEffect, useState } from 'react';
import { store } from './store.js';

// Reactive wrapper around a localStorage key. Each mount reads the current
// value fresh, so switching tabs always shows the latest data even when
// another tab wrote to the same key via store.set() directly.
export function useLocalState(key, initial) {
  const [state, setState] = useState(() => store.get(key, initial));

  useEffect(() => {
    store.set(key, state);
  }, [key, state]);

  return [state, setState];
}
