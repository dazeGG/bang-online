import { useEffect, useState } from 'react';
import { ROOM_CODE_PATTERN } from '@bang/contracts';

export const roomPath = (roomCode: string) => `/room/${roomCode}`;

export function parseRoomPath(pathname: string): string | null {
  const match = /^\/room\/([^/]+)\/?$/.exec(pathname);
  const code = match?.[1]?.toUpperCase();
  return code !== undefined && ROOM_CODE_PATTERN.test(code) ? code : null;
}

export function navigate(path: string) {
  if (window.location.pathname === path) return;
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function usePathname() {
  const [pathname, setPathname] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  return pathname;
}
