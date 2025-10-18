import React from 'react';

const OpenFavoritesContext = React.createContext<{
  openFavorites: Record<string, boolean>;
  toggleOpenFavorites: (zone: string) => void;
  openFavoritesSection: () => void;
} | null>(null);

export const useOpenFavoritesContext = () => {
  const context = React.useContext(OpenFavoritesContext);
  if (!context) {
    throw new Error('useCookiesContext must be used within a CookiesProvider');
  }
  return context;
};

export const OpenFavoritesProvider = ({
  children
}: {
  readonly children: React.ReactNode;
}) => {
  const [openFavorites, setOpenFavorites] = React.useState<
    Record<string, boolean>
  >({ all: true });

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
