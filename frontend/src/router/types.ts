export type AppRoute =
  | '/overview'
  | '/datasets'
  | '/pipeline'
  | '/anomalies'
  | '/reconstruction'
  | '/audit'
  | '/evaluation'
  | '/settings';

export const VALID_ROUTES: AppRoute[] = [
  '/overview',
  '/datasets',
  '/pipeline',
  '/anomalies',
  '/reconstruction',
  '/audit',
  '/evaluation',
  '/settings',
];

export interface RouterContextType {
  currentPath: string;
  navigate: (to: string, replace?: boolean) => void;
  isNotFound: boolean;
}

export const normalizePath = (pathname: string): string => {
  const clean = pathname.trim().replace(/\/+$/, '');
  return clean === '' ? '/' : clean;
};
