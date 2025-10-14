import { useEffect, useState } from 'react';
import { IconButton, Menu, Typography } from '@material-tailwind/react';
import {
  HiOutlineLogout,
  HiOutlineUserCircle,
  HiOutlineBell
} from 'react-icons/hi';
import { HiOutlineAdjustmentsHorizontal } from 'react-icons/hi2';
import { Link } from 'react-router-dom';

import { useProfileContext } from '@/contexts/ProfileContext';
import { useAuthContext } from '@/contexts/AuthContext';

export default function ProfileMenu() {
  const [origin, setOrigin] = useState('');
  const { profile } = useProfileContext();
  const { authStatus, logout } = useAuthContext();

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const handleLogout = async () => {
    // Only use OKTA logout if OKTA is enabled
    if (authStatus?.auth_method === 'okta') {
      await logout();
    } else {
      // For environment-based auth, just redirect to logout
      window.location.href = `${origin}/logout`;
    }
  };

  return (
    <Menu>
      <Menu.Trigger
        as={IconButton}
        className="text-foreground hover:!text-foreground focus:!text-foreground hover:bg-hover-gradient hover:dark:bg-hover-gradient-dark focus:bg-hover-gradient focus:dark:bg-hover-gradient-dark"
        color="secondary"
        size="sm"
        variant="ghost"
      >
        <HiOutlineUserCircle className="stroke-2 icon-large short:icon-default" />
      </Menu.Trigger>
      <Menu.Content className="z-10">
        <div className="w-full flex items-center py-1.5 px-2.5 rounded align-middle select-none outline-none bg-transparent">
          <HiOutlineUserCircle className="mr-2 icon-default" />
          <Typography className="text-sm text-foreground font-sans font-semibold">
            {profile ? profile.username : 'Loading...'}
          </Typography>
        </div>
        <hr className="!my-1 -mx-1 border-surface" />
        <Menu.Item
          as={Link}
          className="text-foreground hover:!text-foreground focus:!text-foreground hover:bg-hover-gradient hover:dark:bg-hover-gradient-dark focus:bg-hover-gradient focus:dark:bg-hover-gradient-dark"
          to="/preferences"
        >
          <HiOutlineAdjustmentsHorizontal className="mr-2 icon-default" />
          Preferences
        </Menu.Item>
        <Menu.Item
          as={Link}
          className="text-foreground hover:!text-foreground focus:!text-foreground hover:bg-hover-gradient hover:dark:bg-hover-gradient-dark focus:bg-hover-gradient focus:dark:bg-hover-gradient-dark"
          to="/notifications"
        >
          <HiOutlineBell className="mr-2 icon-default" />
          Notifications
        </Menu.Item>
        <Menu.Item
          className="text-error hover:bg-error/10 hover:!text-error focus:bg-error/10 focus:!text-error"
          onClick={handleLogout}
        >
          <HiOutlineLogout className="mr-2 h-[18px] w-[18px]" /> Logout
        </Menu.Item>
      </Menu.Content>
    </Menu>
  );
}
