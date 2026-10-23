import { createContext } from 'react';
import type { RouterContextType } from './types';

export const RouterContext = createContext<RouterContextType | null>(null);
