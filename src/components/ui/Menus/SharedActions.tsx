import { Menu, IconButton } from '@material-tailwind/react';
import { HiOutlineEllipsisHorizontalCircle } from 'react-icons/hi2';

import FgMenuItems from './FgMenuItems';
import type { MenuItem } from './FgMenuItems';

type SharedActionsMenuProps<T = unknown> = {
  menuItems: MenuItem<T>[];
  actionProps: T;
};

export default function SharedActionsMenu<T>({
  menuItems,
  actionProps
}: SharedActionsMenuProps<T>) {
  return (
    <Menu>
      <Menu.Trigger
        as={IconButton}
        variant="ghost"
        className="p-1 max-w-fit"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <HiOutlineEllipsisHorizontalCircle className="icon-default text-foreground" />
      </Menu.Trigger>
      <Menu.Content>
        <FgMenuItems<T> menuItems={menuItems} actionProps={actionProps} />
      </Menu.Content>
    </Menu>
  );
}
