import { useEffect, useState } from 'react';
import { IconButton, Menu } from '@material-tailwind/react';
import {
  ArrowRightStartOnRectangleIcon as LogoutIcon,
  UserCircleIcon,
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';

export default function ProfileMenu() {
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  return (
    <Menu>
      <Menu.Trigger
        as={IconButton}
        size="sm"
        variant="ghost"
        color="secondary"
        className="flex items-center justify-center p-1 rounded-full h-8 w-8 x-short:h-6 x-short:w-6 text-foreground dark:text-foreground hover:!text-foreground focus:!text-foreground hover:bg-hover-gradient focus:bg-hover-gradient focus:dark:bg-hover-gradient-dark"
      >
        <UserCircleIcon className="icon-large x-short:icon-default" />
      </Menu.Trigger>
      <Menu.Content>
        <Menu.Item
          as={Link}
          to="/profile"
          className="dark:text-foreground hover:bg-hover-gradient hover:dark:bg-hover-gradient-dark focus:bg-hover-gradient focus:dark:bg-hover-gradient-dark hover:!text-foreground focus:!text-foreground"
        >
          <UserCircleIcon className="mr-2 icon-default" /> Profile
        </Menu.Item>
        <Menu.Item
          as={Link}
          to="/preferences"
          className="dark:text-foreground hover:bg-hover-gradient hover:dark:bg-hover-gradient-dark focus:bg-hover-gradient focus:dark:bg-hover-gradient-dark hover:!text-foreground focus:!text-foreground"
        >
          <AdjustmentsHorizontalIcon className="mr-2 icon-default" />{' '}
          Preferences
        </Menu.Item>
        <hr className="!my-1 -mx-1 border-surface" />
        <Menu.Item
          as={Link}
          to={`${origin}/logout`}
          className="text-error hover:bg-error/10 hover:!text-error focus:bg-error/10 focus:!text-error"
        >
          <LogoutIcon className="mr-2 h-[18px] w-[18px]" /> Logout
        </Menu.Item>
      </Menu.Content>
    </Menu>
  );
}
