import { Outlet } from 'react-router';

export const OtherPagesLayout = () => {
  return (
    <div className="w-full overflow-y-auto">
      <Outlet />
    </div>
  );
};
