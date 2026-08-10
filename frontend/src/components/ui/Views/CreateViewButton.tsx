import { useCreateViewFlow } from '@/hooks/useCreateViewFlow';
import FgButton from '@/components/designSystem/atoms/FgButton';
import type { CartItem } from '@/queries/preferencesQueries';
import type { View } from '@/queries/viewQueries';

interface CreateViewButtonProps {
  readonly datasets: CartItem[];
  readonly defaultName: string;
  readonly label?: string;
  readonly disabled?: boolean;
  readonly onCreated?: (view: View) => void;
}

export default function CreateViewButton({
  datasets,
  defaultName,
  label = 'Create View',
  disabled = false,
  onCreated
}: CreateViewButtonProps) {
  const { startCreateView, dialog, open, pending } = useCreateViewFlow();

  return (
    <>
      {!open ? (
        <FgButton
          disabled={disabled || pending}
          loading={pending}
          loadingText="Creating..."
          onClick={() => startCreateView(datasets, defaultName, onCreated)}
        >
          {label}
        </FgButton>
      ) : null}
      {dialog}
    </>
  );
}
