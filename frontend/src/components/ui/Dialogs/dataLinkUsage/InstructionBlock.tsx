import { ReactNode } from 'react';
import { Typography } from '@material-tailwind/react';

type InstructionBlockProps = {
  readonly steps: ReactNode[];
};

export default function InstructionBlock({ steps }: InstructionBlockProps) {
  return (
    <div className="text-foreground">
      <Typography className="font-semibold text-lg">Steps:</Typography>
      <ol className="space-y-6 mt-3">
        {steps.map((step, index) => (
          <li className="flex items-start gap-3 text-sm" key={index}>
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-semibold">
              {index + 1}
            </span>
            {typeof step === 'string' ? (
              <span className="pt-0.5 text-base">{step}</span>
            ) : (
              <div className="flex flex-col gap-2 pt-0.5 min-w-0 flex-1 text-base">
                {step}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
