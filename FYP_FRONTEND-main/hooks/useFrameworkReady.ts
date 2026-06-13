import { useEffect } from 'react';

declare global {
  interface Window {
    frameworkReady?: () => void;
  }
}

export function useFrameworkReady() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.frameworkReady?.();
    } catch {
      /* optional hook for native runtimes / strict shells */
    }
  }, []);
}
