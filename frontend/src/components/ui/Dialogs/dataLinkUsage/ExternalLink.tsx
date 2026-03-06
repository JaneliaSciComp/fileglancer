import { ReactNode } from 'react';
import { HiExternalLink } from 'react-icons/hi';

export default function ExternalLink({
  href,
  children
}: {
  readonly href: string;
  readonly children: ReactNode;
}) {
  return (
    <a
      className="flex items-center gap-1 text-primary hover:underline"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      <span>{children}</span>
      <HiExternalLink className="icon-xsmall" />
    </a>
  );
}
