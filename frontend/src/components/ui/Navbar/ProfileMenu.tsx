import { IconButton, Menu, Typography } from '@material-tailwind/react';
import {
  HiOutlineLogout,
  HiOutlineUserCircle,
  HiOutlineBell,
  HiOutlineKey
} from 'react-icons/hi';
import { HiOutlineAdjustmentsHorizontal } from 'react-icons/hi2';
import { Link } from 'react-router-dom';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
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
        data-tour="profile-menu"
        size="sm"
        variant="ghost"
      >
        <FgIcon
          className="stroke-2 short:icon-default"
          icon={HiOutlineUserCircle}
          size="lg"
        />
      </Menu.Trigger>
      <Menu.Content className="z-10">
        {isAuthenticated ? (
          <>
            <div className="w-full flex items-center py-1.5 px-2.5 rounded align-middle select-none outline-none bg-transparent">
              <FgIcon className="mr-2" icon={HiOutlineUserCircle} />
              <Typography className="text-sm text-foreground font-sans font-semibold">
                {profile ? profile.username : 'Loading...'}
              </Typography>
            </div>
            <hr className="!my-1 -mx-1 border-surface" />
            <Menu.Item
              as={Link}
              className="text-foreground hover:!text-foreground focus:!text-foreground hover:bg-hover-gradient hover:dark:bg-hover-gradient-dark focus:bg-hover-gradient focus:dark:bg-hover-gradient-dark"
              data-tour="preferences-link"
              to="/preferences"
            >
              <FgIcon className="mr-2" icon={HiOutlineAdjustmentsHorizontal} />
              Preferences
            </Menu.Item>
            <Menu.Item
              as={Link}
              className="text-foreground hover:!text-foreground focus:!text-foreground hover:bg-hover-gradient hover:dark:bg-hover-gradient-dark focus:bg-hover-gradient focus:dark:bg-hover-gradient-dark"
              to="/notifications"
            >
              <FgIcon className="mr-2" icon={HiOutlineBell} />
              Notifications
            </Menu.Item>
            {sshKeysEnabled ? (
              <Menu.Item
                as={Link}
                className="text-foreground hover:!text-foreground focus:!text-foreground hover:bg-hover-gradient hover:dark:bg-hover-gradient-dark focus:bg-hover-gradient focus:dark:bg-hover-gradient-dark"
                to="/ssh-keys"
              >
                <FgIcon className="mr-2" icon={HiOutlineKey} />
                SSH Keys
              </Menu.Item>
            ) : null}
            <Menu.Item
              className="text-error hover:bg-error/10 hover:!text-error focus:bg-error/10 focus:!text-error"
              onClick={handleLogout}
            >
              <FgIcon className="mr-2" icon={HiOutlineLogout} /> Logout
            </Menu.Item>
          </>
        ) : (
          <>
            <div className="w-full flex items-center py-1.5 px-2.5 rounded align-middle select-none outline-none bg-transparent">
              <FgIcon className="mr-2" icon={HiOutlineUserCircle} />
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
              <FgIcon className="mr-2 rotate-180" icon={HiOutlineLogout} />{' '}
              Login
            </Menu.Item>
          </>
        )}
      </Menu.Content>
    </Menu>
  );
}
