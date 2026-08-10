import { IconButton } from '@material-tailwind/react';
import {
  HiOutlineInformationCircle,
  HiOutlineShoppingCart
} from 'react-icons/hi';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgBadge from '@/components/designSystem/atoms/FgBadge';
import { useCartCount } from '@/hooks/useCartCount';

interface BrowseRightRailProps {
  readonly mode: 'properties' | 'cart';
  readonly isOpen: boolean;
  readonly onSelect: (mode: 'properties' | 'cart') => void;
}

export default function BrowseRightRail({
  mode,
  isOpen,
  onSelect
}: BrowseRightRailProps) {
  const cartCount = useCartCount();
  const activeClass = (target: 'properties' | 'cart') =>
    isOpen && mode === target
      ? 'text-primary bg-secondary-light/20'
      : 'text-foreground';

  return (
    <div className="flex flex-col items-center gap-2 shrink-0 w-12 border-l border-surface py-3 bg-background">
      <IconButton
        aria-label="Properties"
        className={`h-9 w-9 rounded-full ${activeClass('properties')}`}
        onClick={() => onSelect('properties')}
        variant="ghost"
      >
        <FgIcon icon={HiOutlineInformationCircle} />
      </IconButton>
      <div className="relative">
        <IconButton
          aria-label="Layer Cart"
          className={`h-9 w-9 rounded-full ${activeClass('cart')}`}
          onClick={() => onSelect('cart')}
          variant="ghost"
        >
          <FgIcon icon={HiOutlineShoppingCart} />
        </IconButton>
        {cartCount > 0 ? (
          <FgBadge
            className="absolute -top-1 -right-1"
            color="secondary"
            size="sm"
            variant="pill"
          >
            {cartCount > 9 ? '9+' : cartCount}
          </FgBadge>
        ) : null}
      </div>
    </div>
  );
}
