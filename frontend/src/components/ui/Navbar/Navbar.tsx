import { useEffect, useState } from 'react';
import {
  Badge,
  IconButton,
  Typography,
  Collapse,
  Navbar,
  List
} from '@material-tailwind/react';
import { Link } from 'react-router';
import type { IconType } from 'react-icons';
import {
  HiOutlineQuestionMarkCircle,
  HiOutlineMenu,
  HiOutlineX,
  HiOutlineShare,
  HiOutlineEye
} from 'react-icons/hi';
import {
  HiOutlineFolder,
  HiOutlineBriefcase,
  HiOutlineRocketLaunch
} from 'react-icons/hi2';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
import LogoSvg from '@/components/ui/Navbar/LogoSvg';
import ProfileMenu from '@/components/ui/Navbar/ProfileMenu';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import { useActiveJobCount } from '@/hooks/useActiveJobCount';
import { trackEvent } from '@/utils/fathom';

type NavLink = {
  icon: IconType;
  title: string;
  href: string;
  badge?: number;
};

// Links list component
function NavList() {
  const tasksEnabled = import.meta.env.VITE_ENABLE_TASKS === 'true';
  const activeJobCount = useActiveJobCount();

  const links: NavLink[] = [
    { icon: HiOutlineFolder, title: 'Browse Files', href: '/browse' },
    { icon: HiOutlineShare, title: 'Data Links', href: '/links' },
    {
      icon: HiOutlineEye,
      title: 'Views',
      href: '/ngviews'
    },
    {
      icon: HiOutlineRocketLaunch,
      title: 'Apps',
      href: '/apps',
      badge: activeJobCount
    },
    { icon: HiOutlineBriefcase, title: 'Tasks', href: '/jobs' },
    { icon: HiOutlineQuestionMarkCircle, title: 'Help', href: '/help' }
  ];

  const filteredLinks = links.filter(link => {
    if (link.href === '/jobs' && !tasksEnabled) {
      return false;
    }
    return true;
  });

  return (
    <>
      {filteredLinks.map(({ icon: Icon, title, href, badge }) => {
        const listItem = (
          <List.Item
            as={Link}
            className="flex items-center dark:!text-foreground hover:bg-hover-gradient hover:dark:bg-hover-gradient-dark focus:bg-hover-gradient focus:dark:bg-hover-gradient-dark hover:!text-foreground focus:!text-foreground"
            key={title}
            onClick={() =>
              trackEvent({
                eventId: `navbar_${title.toLowerCase().replace(' ', '_')}_click`
              })
            }
            to={href}
          >
            <List.ItemStart className="flex items-center mr-1.5">
              <FgIcon className="stroke-2 short:icon-xsmall" icon={Icon} />
            </List.ItemStart>
            <Typography className="short:text-xs" type="small">
              {title}
            </Typography>
          </List.Item>
        );

        if (badge !== undefined && badge > 0) {
          return (
            <Badge
              color="secondary"
              key={title}
              overlap="square"
              placement="top-end"
            >
              <Badge.Content>{listItem}</Badge.Content>
              <Badge.Indicator className="p-0 pointer-events-none text-[10px] min-w-4 min-h-4">
                {badge > 9 ? '9+' : badge}
              </Badge.Indicator>
            </Badge>
          );
        }

        return listItem;
      })}
    </>
  );
}

// Composed navbar
export default function FileglancerNavbar() {
  const [openNav, setOpenNav] = useState(false);

  useEffect(() => {
    window.addEventListener(
      'resize',
      () => window.innerWidth >= 960 && setOpenNav(false)
    );
  }, []);

  return (
    <>
      <Navbar className="flex items-center justify-between p-2 sm:p-4 mx-auto w-full rounded-none bg-background dark:shadow-surface h-[61px]">
        {/* Logo */}
        <div className="flex items-center gap-1">
          <Link
            onClick={() => trackEvent({ eventId: 'navbar_logo_click' })}
            to="/browse"
          >
            <div className="bg-gradient-to-r from-primary to-secondary dark:to-secondary-light bg-clip-text text-transparent flex items-center">
              <LogoSvg />
              <Typography
                className="ml-2 block font-semibold pointer-events-none short:text-base"
                type="h6"
              >
                Janelia Fileglancer
              </Typography>
            </div>
          </Link>
        </div>

        {/* Desktop menu links */}
        <div className="hidden lg:block">
          <List className="mt-4 flex flex-col gap-1 lg:mt-0 lg:flex-row lg:items-center">
            <NavList />
          </List>
        </div>

        {/* Profile dropdown menu */}
        <div className="flex items-center gap-1">
          <FgTooltip label="Profile & settings">
            <ProfileMenu />
          </FgTooltip>
          {/* Mobile menu links button */}
          <FgTooltip label="Navigation menu">
            <IconButton
              className="mr-2 text-foreground hover:!text-foreground focus:!text-foreground lg:hidden hover:bg-hover-gradient hover:dark:bg-hover-gradient-dark focus:bg-hover-gradient focus:dark:bg-hover-gradient-dark"
              color="secondary"
              onClick={() => {
                trackEvent({ eventId: 'navbar_mobile_menu_toggle_click' });
                setOpenNav(!openNav);
              }}
              size="sm"
              variant="ghost"
            >
              {openNav ? (
                <FgIcon
                  className="stroke-2 short:icon-default"
                  icon={HiOutlineX}
                  size="lg"
                />
              ) : (
                <FgIcon
                  className="stroke-2 short:icon-default"
                  icon={HiOutlineMenu}
                  size="lg"
                />
              )}
            </IconButton>
          </FgTooltip>
        </div>
      </Navbar>
      <Collapse className="bg-background" open={openNav}>
        <NavList />
      </Collapse>
    </>
  );
}
