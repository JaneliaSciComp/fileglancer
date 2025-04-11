import React from 'react';
import { useCookies } from 'react-cookie';
import { Cookies } from '../shared.types';

const CookiesContext = React.createContext<{
  cookies: Cookies;
}>({
  cookies: {}
});

export const useCookiesContext = () => {
  const context = React.useContext(CookiesContext);
  if (!context) {
    throw new Error('useCookiesContext must be used within a CookiesProvider');
  }
  return context;
};

export const CookiesProvider = ({
  children
}: {
  children: React.ReactNode;
}) => {
  const [cookies] = useCookies(['_xsrf']);

  return (
    <CookiesContext.Provider value={{ cookies }}>
      {children}
    </CookiesContext.Provider>
  );
};

export default CookiesContext;
