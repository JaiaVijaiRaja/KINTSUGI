import React, { useState, useEffect, useCallback } from 'react';
import { RouterContext } from './context';
import {
  type AppRoute,
  VALID_ROUTES,
  normalizePath,
} from './types';
import { useRouter } from './useRouter';

export { useRouter } from './useRouter';
export {
  type AppRoute,
  type RouterContextType,
  VALID_ROUTES,
  normalizePath,
} from './types';

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window === 'undefined') return '/overview';
    const path = normalizePath(window.location.pathname);
    return path === '/' ? '/overview' : path;
  });

  // Sync initial root '/' redirect to '/overview' in browser address bar
  useEffect(() => {
    const raw = normalizePath(window.location.pathname);
    if (raw === '/') {
      window.history.replaceState(null, '', '/overview');
    }
  }, []);

  // Listen for browser Back/Forward popstate events
  useEffect(() => {
    const handlePopState = () => {
      const path = normalizePath(window.location.pathname);
      setCurrentPath(path === '/' ? '/overview' : path);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((to: string, replace: boolean = false) => {
    const target = normalizePath(to);
    const finalTarget = target === '/' ? '/overview' : target;

    if (replace) {
      window.history.replaceState(null, '', finalTarget);
    } else {
      window.history.pushState(null, '', finalTarget);
    }
    setCurrentPath(finalTarget);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const isNotFound = !VALID_ROUTES.includes(currentPath as AppRoute);

  return (
    <RouterContext.Provider value={{ currentPath, navigate, isNotFound }}>
      {children}
    </RouterContext.Provider>
  );
};

interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
  replace?: boolean;
  activeClassName?: string;
}

export const Link: React.FC<LinkProps> = ({
  to,
  replace = false,
  className = '',
  activeClassName = '',
  children,
  onClick,
  ...props
}) => {
  const { currentPath, navigate } = useRouter();
  const isActive = currentPath === normalizePath(to);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) onClick(e);
    if (
      !e.defaultPrevented &&
      e.button === 0 &&
      !e.metaKey &&
      !e.altKey &&
      !e.ctrlKey &&
      !e.shiftKey &&
      to.startsWith('/')
    ) {
      e.preventDefault();
      navigate(to, replace);
    }
  };

  const finalClassName = `${className} ${isActive ? activeClassName : ''}`.trim();

  return (
    <a
      href={to}
      onClick={handleClick}
      className={finalClassName}
      aria-current={isActive ? 'page' : undefined}
      {...props}
    >
      {children}
    </a>
  );
};
