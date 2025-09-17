import { Navigate } from 'react-router';

export default function Home() {
  return <Navigate replace={true} to="/browse" />;
}
