import { Menu, Typography } from '@material-tailwind/react';

export type MenuItem<T = unknown> = {
  name: string;
  action?: (props: T) => void;
  color?: string;
  shouldShow?: boolean;
};

export default function FgMenuItems<T>({
  menuItems,
  actionProps
}: {
  readonly menuItems: MenuItem<T>[];
  readonly actionProps: T;
}) {
  return (
    <>
      {menuItems
        .filter(item => item.shouldShow !== false)
        .map((item, index) => (
          <Menu.Item
            key={index}
            onClick={() => item.action && item.action(actionProps)}
          >
            <Typography
              className={`text-sm p-1  ${item.color || 'text-secondary-light'}`}
            >
              {item.name}
            </Typography>
          </Menu.Item>
        ))}
    </>
  );
}
