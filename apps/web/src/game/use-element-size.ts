import { useLayoutEffect, useRef, useState } from 'react';

export interface ElementSize {
  w: number;
  h: number;
}

/** Measures an element with ResizeObserver; the fallback is used before mounting. */
export function useElementSize<T extends HTMLElement>(fallback: ElementSize) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState(fallback);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () =>
      setSize((current) =>
        current.w === node.clientWidth && current.h === node.clientHeight
          ? current
          : { w: node.clientWidth, h: node.clientHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}
