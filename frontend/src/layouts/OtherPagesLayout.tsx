import { Outlet } from 'react-router';

export const OtherPagesLayout = () => {
  return (
    <div className="w-full overflow-y-auto flex flex-col p-10">
      <div className="w-4/5 max-w-6xl mx-auto">
        <Outlet />
      </div>
    </div>
  );
};
