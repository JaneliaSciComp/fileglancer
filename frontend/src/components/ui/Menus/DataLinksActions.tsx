import type { MouseEvent } from 'react';
import { Menu, IconButton } from '@material-tailwind/react';
import { HiOutlineEllipsisHorizontalCircle } from 'react-icons/hi2';

import FgMenuItems from './FgMenuItems';
import type { MenuItem } from './FgMenuItems';

type SharedActionsMenuProps<T = unknown> = {
  readonly menuItems: MenuItem<T>[];
  readonly actionProps: T;
};

export default function DataLinksActionsMenu<T>({
  menuItems,
  actionProps
}: SharedActionsMenuProps<T>) {
  return (
    <Menu>
      <Menu.Trigger
        as={IconButton}
        className="p-1 max-w-fit"
        onClick={(e: MouseEvent) => e.stopPropagation()}
        variant="ghost"
      >
        <HiOutlineEllipsisHorizontalCircle className="icon-default text-foreground" />
      </Menu.Trigger>
      <Menu.Content>
        <FgMenuItems<T> actionProps={actionProps} menuItems={menuItems} />
      </Menu.Content>
    </Menu>
  );
}
