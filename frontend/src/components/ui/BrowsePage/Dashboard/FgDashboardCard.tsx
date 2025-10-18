import { Card, Typography } from '@material-tailwind/react';

export default function DashboardCard({
  title,
  children
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col w-full border bg-background border-surface h-[670px]">
      <div className="mb-auto p-4">
        <Card.Header className="px-8">
          <Typography
            className="font-semibold text-surface-foreground border-b-2 border-surface py-2"
            type="lead"
          >
            {title}
          </Typography>
        </Card.Header>
        <Card.Body className="py-1">{children}</Card.Body>
      </div>
    </Card>
  );
}
