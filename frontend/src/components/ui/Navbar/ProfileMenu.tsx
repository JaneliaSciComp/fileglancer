import { IconButton, Menu, Typography } from '@material-tailwind/react';
import {
  HiOutlineLogout,
  HiOutlineUserCircle,
  HiOutlineBell,
  HiOutlineKey
} from 'react-icons/hi';
import { HiOutlineAdjustmentsHorizontal } from 'react-icons/hi2';
import { Link } from 'react-router-dom';

import { useProfileContext } from '@/contexts/ProfileContext';
import { useAuthContext } from '@/contexts/AuthContext';

export default function ProfileMenu() {
  const { profile } = useProfileContext();
  const { logout, authStatus } = useAuthContext();
  const sshKeysEnabled = import.meta.env.VITE_ENABLE_SSH_KEYS === 'true';

  const handleLogout = async () => {
    // Use logout for all auth methods (both OKTA and simple)
    await logout();
  };

  const isAuthenticated = authStatus?.authenticated;
  const loginUrl =
    authStatus?.auth_method === 'okta' ? '/api/auth/login' : '/login';

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
        {isAuthenticated ? (
          <>
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
            {sshKeysEnabled ? (
              <Menu.Item
                as={Link}
                className="text-foreground hover:!text-foreground focus:!text-foreground hover:bg-hover-gradient hover:dark:bg-hover-gradient-dark focus:bg-hover-gradient focus:dark:bg-hover-gradient-dark"
                to="/ssh-keys"
              >
                <HiOutlineKey className="mr-2 icon-default" />
                Manage SSH Keys
              </Menu.Item>
            ) : null}
            <Menu.Item
              className="text-error hover:bg-error/10 hover:!text-error focus:bg-error/10 focus:!text-error"
              onClick={handleLogout}
            >
              <HiOutlineLogout className="mr-2 h-[18px] w-[18px]" /> Logout
            </Menu.Item>
          </>
        ) : (
          <>
            <div className="w-full flex items-center py-1.5 px-2.5 rounded align-middle select-none outline-none bg-transparent">
              <HiOutlineUserCircle className="mr-2 icon-default" />
              <Typography className="text-sm text-foreground font-sans font-semibold">
                Not logged in
              </Typography>
            </div>
            <hr className="!my-1 -mx-1 border-surface" />
            <Menu.Item
              as="a"
              className="text-primary hover:!text-primary focus:!text-primary hover:bg-primary/10 focus:bg-primary/10"
              href={loginUrl}
            >
              <HiOutlineLogout className="mr-2 h-[18px] w-[18px] rotate-180" />{' '}
              Login
            </Menu.Item>
          </>
        )}
      </Menu.Content>
    </Menu>
  );
}
