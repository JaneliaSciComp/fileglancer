import type { ChangeEvent } from 'react';
import { Card, Input } from '@material-tailwind/react';
import { HiOutlineFunnel, HiXMark } from 'react-icons/hi2';

import FavoritesBrowser from './FavoritesBrowser';
import ZonesBrowser from './ZonesBrowser';
import useFilteredZonesAndFavorites from '@/hooks/useFilteredZonesAndFavorites';

export default function Sidebar() {
  const {
    searchQuery,
    handleSearchChange,
    clearSearch,
    filteredZonesMap,
    filteredZoneFavorites,
    filteredFileSharePathFavorites,
    filteredFolderFavorites
  } = useFilteredZonesAndFavorites();

  return (
    <Card
      className="min-w-full h-full overflow-hidden rounded-none bg-surface shadow-lg flex flex-col pl-3"
      data-tour="sidebar"
    >
      <div className="my-3 short:my-1 relative">
        <Input
          className="bg-background text-foreground short:text-xs [&::-webkit-search-cancel-button]:appearance-none"
          onChange={(e: ChangeEvent<HTMLInputElement>) => handleSearchChange(e)}
          placeholder="Type to filter zones"
          type="search"
          value={searchQuery}
        >
          <Input.Icon>
            <HiOutlineFunnel className="h-full w-full" />
          </Input.Icon>
        </Input>
        {searchQuery ? (
          <button
            aria-label="Clear search"
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-primary hover:text-primary/80 transition-colors"
            onClick={clearSearch}
            type="button"
          >
            <HiXMark className="h-5 w-5 font-bold" />
          </button>
        ) : null}
      </div>
      <div className="flex flex-col overflow-y-scroll flex-grow mb-3 short:gap-1 w-full border border-surface rounded-md py-2 px-2.5 shadow-sm bg-background sidebar-scroll">
        <FavoritesBrowser
          filteredFileSharePathFavorites={filteredFileSharePathFavorites}
          filteredFolderFavorites={filteredFolderFavorites}
          filteredZoneFavorites={filteredZoneFavorites}
          searchQuery={searchQuery}
        />
        <ZonesBrowser
          filteredZonesMap={filteredZonesMap}
          searchQuery={searchQuery}
        />
      </div>
    </Card>
  );
}
