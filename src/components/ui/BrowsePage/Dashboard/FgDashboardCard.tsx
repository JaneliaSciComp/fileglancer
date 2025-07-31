import { Card, Typography } from '@material-tailwind/react';

export default function DashboardCard({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <Card.Header className="pt-4 pl-4">
        <Typography className="font-semibold text-surface-foreground">
          {title}
        </Typography>
      </Card.Header>
      <Card.Body className="pt-0">{children}</Card.Body>
    </Card>
  );
}
