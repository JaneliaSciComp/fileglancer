import type { MouseEvent } from 'react';
import { Menu, IconButton } from '@material-tailwind/react';
import { HiOutlineEllipsisHorizontalCircle } from 'react-icons/hi2';
import type { IconType } from 'react-icons';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgMenuItems from './FgMenuItems';
import type { MenuItem } from './FgMenuItems';

type CardActionsMenuProps<T = unknown> = {
  readonly menuItems: MenuItem<T>[];
  readonly actionProps: T;
  readonly triggerIcon?: IconType;
};

export default function CardActionsMenu<T>({
  menuItems,
  actionProps,
  triggerIcon = HiOutlineEllipsisHorizontalCircle
}: CardActionsMenuProps<T>) {
  return (
    <Menu>
      <Menu.Trigger
        as={IconButton}
        className="p-1 max-w-fit"
        onClick={(e: MouseEvent) => e.stopPropagation()}
        variant="ghost"
      >
        <FgIcon className="text-foreground" icon={triggerIcon} />
      </Menu.Trigger>
      <Menu.Content>
        <FgMenuItems<T> actionProps={actionProps} menuItems={menuItems} />
      </Menu.Content>
    </Menu>
  );
}
