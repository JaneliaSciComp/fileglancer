import { Typography } from '@material-tailwind/react';
import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';
import ProxiedPathRow from './ui/Shared/ProxiedPathRow';

export default function Shared() {
  const { allProxiedPaths } = useProxiedPathContext();

  return (
    <div className="w-full flex justify-center">
      <div className="w-full max-w-6xl p-6">
        <Typography variant="h5" className="mb-6 text-foreground font-bold">
          Shared Paths
        </Typography>
        <div className="rounded-lg shadow bg-background">
          <div className="grid grid-cols-[1.5fr_2.5fr_1.5fr_1fr] gap-4 px-4 py-2 border-b border-surface">
            <Typography variant="small" className="font-bold">
              Name
            </Typography>
            <Typography variant="small" className="font-bold">
              Path
            </Typography>
            <Typography variant="small" className="font-bold">
              Date shared
            </Typography>
            <Typography variant="small" className="font-bold">
              Actions
            </Typography>
          </div>
          {allProxiedPaths?.map(item => (
            <ProxiedPathRow item={item} />
          ))}
          {!allProxiedPaths || allProxiedPaths?.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              No shared paths.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
