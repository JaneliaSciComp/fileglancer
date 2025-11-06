import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

const OpenFavoritesContext = createContext<{
  openFavorites: Record<string, boolean>;
  toggleOpenFavorites: (zone: string) => void;
  openFavoritesSection: () => void;
} | null>(null);

export const useOpenFavoritesContext = () => {
  const context = useContext(OpenFavoritesContext);
  if (!context) {
    throw new Error(
      'useOpenFavoritesContext must be used within a OpenFavoritesProvider'
    );
  }
  return context;
};

export const OpenFavoritesProvider = ({
  children
}: {
  readonly children: ReactNode;
}) => {
  const [openFavorites, setOpenFavorites] = useState<Record<string, boolean>>({
    all: true
  });

  function toggleOpenFavorites(zone: string) {
    setOpenFavorites(prev => ({
      ...prev,
      [zone]: !prev[zone]
    }));
  }

  function openFavoritesSection() {
    setOpenFavorites(prev => {
      // if 'all' is already true, do nothing
      if (prev.all) {
        return prev;
      }
      // otherwise, set 'all' to true
      return { ...prev, all: true };
    });
  }

  return (
    <OpenFavoritesContext.Provider
      value={{ openFavorites, toggleOpenFavorites, openFavoritesSection }}
    >
      {children}
    </OpenFavoritesContext.Provider>
  );
};

export default OpenFavoritesContext;
