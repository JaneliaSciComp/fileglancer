import { Navigate } from 'react-router';

export default function Home() {
  return <Navigate to="/browse" replace={true} />;
}
