import * as React from 'react';

const LogoIcon = () => (
  <svg
    className="icon-large short:icon-small text-primary"
    fill="currentColor"
    stroke="currentColor"
    version="1.1"
    viewBox="0 0 18 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M 16.49997,21 V 9 h -5.25 c -1.24218,0 -2.25,-1.00781 -2.25,-2.25 V 1.5 h -6 c -0.82968,0 -1.5,0.67032 -1.5,1.5 v 18 c 0,0.82969 0.67032,1.5 1.5,1.5 h 12 c 0.82969,0 1.5,-0.67031 1.5,-1.5 z M 16.47657,7.5 C 16.44377,7.36875 16.37817,7.24688 16.27969,7.15313 L 10.84688,1.72032 C 10.74848,1.62192 10.63125,1.55625 10.5,1.52344 V 6.75 c 0,0.4125 0.3375,0.75 0.75,0.75 z M 0,3 C 0,1.34532 1.34532,0 3,0 h 7.31719 c 0.59531,0 1.16719,0.23907 1.58906,0.66094 l 5.43282,5.42813 C 17.76094,6.51094 18,7.08282 18,7.67813 V 21 c 0,1.65469 -1.34531,3 -3,3 H 3 C 1.34532,24 0,22.65469 0,21 Z"
      stroke="currentColor"
      strokeWidth="0.046875"
    />
    <g transform="matrix(0.61810071,0,0,0.61810071,-80.271649,-148.50575)">
      <path
        d="m 144.45891,267.17308 c 1.6569,0 3,-1.3431 3,-3 0,-1.6569 -1.3431,-3 -3,-3 -1.6569,0 -3,1.3431 -3,3 0,1.6569 1.3431,3 3,3 z"
        stroke="currentColor"
      />
      <path
        clipRule="evenodd"
        d="m 133.78232,263.61978 c 1.48725,-4.47099 5.7045,-7.6967 10.67709,-7.6967 4.9703,0 9.1859,3.22271 10.675,7.6905 0.1204,0.361 0.1205,0.7517 4e-4,1.1128 -1.4873,4.471 -5.7045,7.6967 -10.6771,7.6967 -4.97033,0 -9.18596,-3.2227 -10.67506,-7.6905 -0.12034,-0.361 -0.12046,-0.7517 -3.3e-4,-1.1128 z m 15.92659,0.5533 c 0,2.8995 -2.3505,5.25 -5.25,5.25 -2.8995,0 -5.25,-2.3505 -5.25,-5.25 0,-2.8995 2.3505,-5.25 5.25,-5.25 2.8995,0 5.25,2.3505 5.25,5.25 z"
        fillRule="evenodd"
        stroke="currentColor"
      />
    </g>
  </svg>
);
import {
  IconButton,
  Typography,
  Collapse,
  Navbar,
  List
} from '@material-tailwind/react';
import { Link } from 'react-router-dom';
import {
  HiOutlineInformationCircle,
  HiOutlineMoon,
  HiOutlineMenu,
  HiOutlineX,
  HiOutlineShare,
  HiOutlineSun
} from 'react-icons/hi';
import { HiOutlineFolder, HiOutlineBriefcase } from 'react-icons/hi2';
import { TbBrandGithub } from 'react-icons/tb';

import ProfileMenu from './ProfileMenu';
import { BetaSticker } from '@/components/ui/Beta';
import useTheme from '@/hooks/useTheme';
import { trackEvent } from '@/utils/fathom';

const LINKS = [
  {
    icon: HiOutlineFolder,
    title: 'Browse Files',
    href: '/browse'
  },
  {
    icon: HiOutlineShare,
    title: 'Data Links',
    href: '/links'
  },
  {
    icon: HiOutlineBriefcase,
    title: 'Tasks',
    href: '/jobs'
  },
  {
    icon: HiOutlineInformationCircle,
    title: 'Help',
    href: '/help'
  }
];

// Links list component
const NavList = () => {
  return (
    <>
      {LINKS.map(({ icon: Icon, title, href }) => (
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
            <Icon className="stroke-2 icon-default short:icon-xsmall" />
          </List.ItemStart>
          <Typography className="short:text-xs" type="small">
            {title}
          </Typography>
        </List.Item>
      ))}
    </>
  );
};

// Composed navbar
export default function FileglancerNavbar() {
  const [openNav, setOpenNav] = React.useState(false);
  const { toggleTheme, isLightTheme, setIsLightTheme } = useTheme();

  React.useEffect(() => {
    window.addEventListener(
      'resize',
      () => window.innerWidth >= 960 && setOpenNav(false)
    );
    // Set theme from local storage
    const theme = localStorage.getItem('theme');
    if (theme === 'dark') {
      setIsLightTheme(false);
      document.documentElement.classList.add('dark');
    }
  }, [setIsLightTheme]);

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
              <LogoIcon />
              <Typography
                className="ml-2 block font-semibold pointer-events-none short:text-base"
                type="h6"
              >
                Janelia Fileglancer
              </Typography>
            </div>
          </Link>
          <BetaSticker />
        </div>

        {/* Desktop menu links */}
        <div className="hidden lg:block">
          <List className="mt-4 flex flex-col gap-1 lg:mt-0 lg:flex-row lg:items-center">
            <NavList />
          </List>
        </div>

        {/* Theme toggle and profile dropdown menu */}
        <div className="flex items-center gap-1">
          <IconButton
            as={Link}
            className="text-foreground hover:!text-foreground focus:!text-foreground hover:bg-hover-gradient hover:dark:bg-hover-gradient-dark focus:bg-hover-gradient focus:dark:bg-hover-gradient-dark"
            color="secondary"
            onClick={() => trackEvent({ eventId: 'navbar_github_click' })}
            rel="noopener noreferrer"
            size="sm"
            target="_blank"
            to="https://github.com/JaneliaSciComp/fileglancer"
            variant="ghost"
          >
            <TbBrandGithub className="icon-large short:icon-default" />
          </IconButton>
          <IconButton
            className="text-foreground hover:!text-foreground focus:!text-foreground hover:bg-hover-gradient hover:dark:bg-hover-gradient-dark focus:bg-hover-gradient focus:dark:bg-hover-gradient-dark"
            color="secondary"
            onClick={() => {
              trackEvent({ eventId: 'navbar_theme_toggle_click' });
              toggleTheme();
            }}
            size="sm"
            variant="ghost"
          >
            {isLightTheme ? (
              <HiOutlineSun className="stroke-2 icon-large short:icon-default" />
            ) : (
              <HiOutlineMoon className="stroke-2 icon-large short:icon-default" />
            )}
          </IconButton>
          <ProfileMenu />
          {/* Mobile menu links button */}
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
              <HiOutlineX className="stroke-2 icon-large short:icon-default" />
            ) : (
              <HiOutlineMenu className="stroke-2 icon-large short:icon-default" />
            )}
          </IconButton>
        </div>
      </Navbar>
      <Collapse className="bg-background" open={openNav}>
        <NavList />
      </Collapse>
    </>
  );
}
