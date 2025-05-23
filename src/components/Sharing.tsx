import { Button } from '@material-tailwind/react';
import { useSharedPathsContext } from '@/contexts/SharedPathsContext';

export default function Sharing() {
  const { fetchSharedPaths } = useSharedPathsContext();

  return (
    <div className="p-4">
      <Button className="text-foreground text-lg" onClick={fetchSharedPaths}>
        Log shared paths
      </Button>
    </div>
  );
}
