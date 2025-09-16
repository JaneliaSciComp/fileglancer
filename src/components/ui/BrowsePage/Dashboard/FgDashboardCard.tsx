import { Card, Typography } from '@material-tailwind/react';

export default function DashboardCard({
  title,
  children
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <Card className="w-full border bg-background border-surface overflow-y-auto min-h-32 max-h-full">
      <Card.Header className="pt-4 pl-4">
        <Typography className="font-semibold text-surface-foreground">
          {title}
        </Typography>
      </Card.Header>
      <Card.Body className="pt-0">{children}</Card.Body>
    </Card>
  );
}
