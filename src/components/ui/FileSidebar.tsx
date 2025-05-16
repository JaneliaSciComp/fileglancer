import React from 'react';
import { Link } from 'react-router';
import {
  Card,
  Collapse,
  Typography,
  List,
  Input
} from '@material-tailwind/react';
import { Folder, FilterList, NavArrowRight, Server } from 'iconoir-react';

import useZoneFilter from '../../hooks/useZoneFilter';
import { FileSharePaths } from '../../hooks/useFileBrowser';

type FileSidebarProps = {
  fileSharePaths: FileSharePaths;
  openZones: Record<string, boolean>;
  toggleZone: (zone: string) => void;
  handlePathClick: (path: string) => void;
};

export default function FileSidebar({
  fileSharePaths,
  openZones,
  toggleZone,
  handlePathClick
}: FileSidebarProps) {
  const { searchQuery, filteredFileSharePaths, handleSearchChange } =
    useZoneFilter();

  const displayPaths =
    Object.keys(filteredFileSharePaths).length > 0 || searchQuery.length > 0
      ? filteredFileSharePaths
      : fileSharePaths;

  return (
    <Card className="max-w-[280px] h-full rounded-none bg-surface shadow-lg">
      <div className="w-[calc(100%-1.5rem)] mx-3 mt-3">
        <Input
          className="bg-background text-foreground"
          type="search"
          placeholder="Type to filter zones"
          value={searchQuery}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            handleSearchChange(e, fileSharePaths)
          }
        >
          <Input.Icon>
            <FilterList className="h-full w-full" />
          </Input.Icon>
        </Input>
      </div>

      <div className="w-[calc(100%-1.5rem)] mt-3 mx-3 bg-background border border-surface shadow-sm">
        <List className="bg-surface-light border border-surface py-2">
          <List.Item className="pointer-events-none">
            <List.ItemStart>
              <Server className="h-5 w-5 text-surface-foreground" />
            </List.ItemStart>
            <Typography className="font-semibold text-surface-foreground">
              Zones
            </Typography>
          </List.Item>
        </List>
        <List className="bg-background overflow-y-auto">
          {Object.entries(displayPaths).map(([zone, paths], index) => {
            const isOpen = openZones[zone] || false;
            return (
              <React.Fragment key={zone}>
                <List.Item
                  onClick={() => toggleZone(zone)}
                  className="cursor-pointer rounded-none py-3 hover:bg-primary-light/30"
                >
                  <List.ItemStart>
                    <Server className="h-[18px] w-[18px]" />
                  </List.ItemStart>
                  {zone}
                  <List.ItemEnd>
                    <NavArrowRight
                      className={`h-4 w-4 ${isOpen ? 'rotate-90' : ''}`}
                    />
                  </List.ItemEnd>
                </List.Item>
                <Collapse open={isOpen}>
                  <List className="bg-background">
                    {paths.map((path: string, index) => (
                      <List.Item
                        key={`${zone}-${path}`}
                        onClick={() => handlePathClick(path)}
                        className={`pl-5 rounded-none cursor-pointer hover:bg-primary-light/30 focus:bg-primary-light/30 hover:!text-foreground focus:!text-foreground ${index % 2 === 0 ? 'bg-surface/50' : 'bg-background'}`}
                        as={Link}
                        to="/files"
                      >
                        <List.ItemStart>
                          <Folder className="h-[18px] w-[18px]" />
                        </List.ItemStart>
                        {path}
                      </List.Item>
                    ))}
                  </List>
                </Collapse>
              </React.Fragment>
            );
          })}
        </List>
      </div>
    </Card>
  );
}
