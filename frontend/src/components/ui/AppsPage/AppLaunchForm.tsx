import { useState } from 'react';

import { Button, Typography } from '@material-tailwind/react';
import { HiOutlinePlay } from 'react-icons/hi';

import FileSelectorButton from '@/components/ui/BrowsePage/FileSelector/FileSelectorButton';
import { validatePaths } from '@/queries/appsQueries';
import { convertBackToForwardSlash } from '@/utils/pathHandling';
import type {
  AppEntryPoint,
  AppManifest,
  AppParameter,
  AppResourceDefaults
} from '@/shared.types';

interface AppLaunchFormProps {
  readonly manifest: AppManifest;
  readonly entryPoint: AppEntryPoint;
  readonly onSubmit: (
    parameters: Record<string, unknown>,
    resources?: AppResourceDefaults,
    pullLatest?: boolean
  ) => Promise<void>;
  readonly submitting: boolean;
  readonly initialValues?: Record<string, unknown>;
}

function ParameterField({
  param,
  value,
  onChange
}: {
  readonly param: AppParameter;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}) {
  const baseInputClass =
    'w-full p-2 text-foreground border rounded-sm focus:outline-none bg-background border-primary-light focus:border-primary';

  switch (param.type) {
    case 'boolean':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            checked={!!value}
            className="h-4 w-4 accent-primary"
            onChange={e => onChange(e.target.checked)}
            type="checkbox"
          />
          <span className="text-foreground text-sm">{param.name}</span>
        </label>
      );

    case 'integer':
    case 'number':
      return (
        <input
          className={baseInputClass}
          max={param.max}
          min={param.min}
          onChange={e => {
            const val = e.target.value;
            if (val === '') {
              onChange(undefined);
            } else {
              onChange(
                param.type === 'integer' ? parseInt(val) : parseFloat(val)
              );
            }
          }}
          placeholder={param.description || param.name}
          step={param.type === 'integer' ? 1 : 'any'}
          type="number"
          value={value !== undefined && value !== null ? String(value) : ''}
        />
      );

    case 'enum':
      return (
        <select
          className={baseInputClass}
          onChange={e => onChange(e.target.value)}
          value={value !== undefined && value !== null ? String(value) : ''}
        >
          <option value="">Select...</option>
          {param.options?.map(opt => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );

    case 'file':
    case 'directory':
      return (
        <div className="flex gap-2">
          <input
            className={`flex-1 ${baseInputClass}`}
            onChange={e => onChange(e.target.value)}
            placeholder={param.description || `Select a ${param.type}...`}
            type="text"
            value={value !== undefined && value !== null ? String(value) : ''}
          />
          <FileSelectorButton
            initialPath={typeof value === 'string' ? value : undefined}
            label="Browse..."
            mode={param.type === 'file' ? 'file' : 'directory'}
            onSelect={path => onChange(path)}
            useServerPath
          />
        </div>
      );

    default:
      return (
        <input
          className={baseInputClass}
          onChange={e => onChange(e.target.value)}
          placeholder={param.description || param.name}
          type="text"
          value={value !== undefined && value !== null ? String(value) : ''}
        />
      );
  }
}

export default function AppLaunchForm({
  manifest,
  entryPoint,
  onSubmit,
  submitting,
  initialValues: externalValues
}: AppLaunchFormProps) {
  // Initialize parameter values: external values override defaults
  const defaultValues: Record<string, unknown> = {};
  for (const param of entryPoint.parameters) {
    if (param.default !== undefined) {
      defaultValues[param.id] = param.default;
    }
  }
  const startingValues = externalValues
    ? { ...defaultValues, ...externalValues }
    : defaultValues;

  const [values, setValues] = useState<Record<string, unknown>>(startingValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pullLatest, setPullLatest] = useState(false);
  const [showResources, setShowResources] = useState(false);
  const [resources, setResources] = useState<AppResourceDefaults>({
    cpus: entryPoint.resources?.cpus,
    memory: entryPoint.resources?.memory,
    walltime: entryPoint.resources?.walltime
  });

  const handleChange = (paramId: string, value: unknown) => {
    setValues(prev => ({ ...prev, [paramId]: value }));
    // Clear error on change
    if (errors[paramId]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[paramId];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    for (const param of entryPoint.parameters) {
      const val = values[param.id];
      if (param.required && (val === undefined || val === null || val === '')) {
        newErrors[param.id] = `${param.name} is required`;
      }
      if (
        val !== undefined &&
        val !== null &&
        val !== '' &&
        (param.type === 'integer' || param.type === 'number')
      ) {
        const numVal = Number(val);
        if (isNaN(numVal)) {
          newErrors[param.id] = `${param.name} must be a valid number`;
        } else {
          if (param.min !== undefined && numVal < param.min) {
            newErrors[param.id] = `${param.name} must be at least ${param.min}`;
          }
          if (param.max !== undefined && numVal > param.max) {
            newErrors[param.id] = `${param.name} must be at most ${param.max}`;
          }
        }
      }
      // Validate file/directory paths are absolute
      if (
        val !== undefined &&
        val !== null &&
        val !== '' &&
        (param.type === 'file' || param.type === 'directory') &&
        typeof val === 'string'
      ) {
        const normalized = convertBackToForwardSlash(val);
        if (!normalized.startsWith('/') && !normalized.startsWith('~')) {
          newErrors[param.id] =
            `${param.name} must be an absolute path (starting with / or ~)`;
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const [validating, setValidating] = useState(false);

  const handleSubmit = async () => {
    if (!validate()) {
      return;
    }

    // Build a lookup of parameter definitions
    const paramDefs = new Map(entryPoint.parameters.map(p => [p.id, p]));

    // Filter out undefined/empty values and normalize paths to Linux format
    const params: Record<string, unknown> = {};
    const pathParams: Record<string, string> = {};
    for (const [key, val] of Object.entries(values)) {
      if (val !== undefined && val !== null && val !== '') {
        const paramDef = paramDefs.get(key);
        if (
          paramDef &&
          (paramDef.type === 'file' || paramDef.type === 'directory') &&
          typeof val === 'string'
        ) {
          const normalized = convertBackToForwardSlash(val);
          params[key] = normalized;
          pathParams[key] = normalized;
        } else {
          params[key] = val;
        }
      }
    }

    // Validate paths on the server before submitting
    if (Object.keys(pathParams).length > 0) {
      setValidating(true);
      try {
        const pathErrors = await validatePaths(pathParams);
        if (Object.keys(pathErrors).length > 0) {
          setErrors(prev => ({ ...prev, ...pathErrors }));
          setValidating(false);
          return;
        }
      } catch {
        setErrors(prev => ({
          ...prev,
          _general: 'Failed to validate paths'
        }));
        setValidating(false);
        return;
      }
      setValidating(false);
    }

    // Only pass resources if user modified them
    const hasResourceOverrides =
      showResources &&
      (resources.cpus || resources.memory || resources.walltime);

    await onSubmit(
      params,
      hasResourceOverrides ? resources : undefined,
      pullLatest || undefined
    );
  };

  return (
    <div className="max-w-2xl">
      <Typography className="text-foreground font-bold mb-1" type="h5">
        {entryPoint.name}
      </Typography>
      <Typography className="text-secondary mb-1" type="small">
        {manifest.name}
        {manifest.version ? ` v${manifest.version}` : ''}
      </Typography>
      {entryPoint.description ? (
        <Typography className="text-secondary mb-6" type="small">
          {entryPoint.description}
        </Typography>
      ) : null}

      {/* Parameters */}
      <div className="space-y-4 mb-6">
        {entryPoint.parameters.map(param => (
          <div key={param.id}>
            {param.type !== 'boolean' ? (
              <label
                className="block text-foreground text-sm font-medium mb-1"
                htmlFor={`param-${param.id}`}
              >
                {param.name}
                {param.required ? (
                  <span className="text-error ml-1">*</span>
                ) : null}
              </label>
            ) : null}
            {param.description && param.type !== 'boolean' ? (
              <Typography className="text-secondary mb-1" type="small">
                {param.description}
              </Typography>
            ) : null}
            <ParameterField
              onChange={val => handleChange(param.id, val)}
              param={param}
              value={values[param.id]}
            />
            {errors[param.id] ? (
              <Typography className="text-error mt-1" type="small">
                {errors[param.id]}
              </Typography>
            ) : null}
          </div>
        ))}
      </div>

      {/* Pull latest toggle */}
      <div className="mb-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            checked={pullLatest}
            className="h-4 w-4 accent-primary"
            onChange={e => setPullLatest(e.target.checked)}
            type="checkbox"
          />
          <span className="text-foreground text-sm">
            Pull latest code before running
          </span>
        </label>
        <Typography className="text-secondary mt-1" type="small">
          When enabled, runs git pull to fetch the latest code from GitHub
          before starting the job.
        </Typography>
      </div>

      {/* Resource Overrides (collapsible) */}
      <div className="mb-6">
        <button
          className="text-sm text-primary hover:underline"
          onClick={() => setShowResources(!showResources)}
          type="button"
        >
          {showResources ? 'Hide' : 'Show'} resource options
        </button>
        {showResources ? (
          <div className="mt-3 p-4 bg-surface/30 rounded border border-primary-light space-y-3">
            <div>
              <label className="block text-foreground text-sm font-medium mb-1">
                CPUs
              </label>
              <input
                className="w-full p-2 text-foreground border rounded-sm focus:outline-none bg-background border-primary-light focus:border-primary"
                min={1}
                onChange={e =>
                  setResources(prev => ({
                    ...prev,
                    cpus: e.target.value ? parseInt(e.target.value) : undefined
                  }))
                }
                placeholder="Number of CPUs"
                type="number"
                value={resources.cpus ?? ''}
              />
            </div>
            <div>
              <label className="block text-foreground text-sm font-medium mb-1">
                Memory
              </label>
              <input
                className="w-full p-2 text-foreground border rounded-sm focus:outline-none bg-background border-primary-light focus:border-primary"
                onChange={e =>
                  setResources(prev => ({
                    ...prev,
                    memory: e.target.value || undefined
                  }))
                }
                placeholder="e.g. 16 GB"
                type="text"
                value={resources.memory ?? ''}
              />
            </div>
            <div>
              <label className="block text-foreground text-sm font-medium mb-1">
                Wall Time
              </label>
              <input
                className="w-full p-2 text-foreground border rounded-sm focus:outline-none bg-background border-primary-light focus:border-primary"
                onChange={e =>
                  setResources(prev => ({
                    ...prev,
                    walltime: e.target.value || undefined
                  }))
                }
                placeholder="e.g. 04:00"
                type="text"
                value={resources.walltime ?? ''}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Validation error summary */}
      {Object.keys(errors).length > 0 ? (
        <div className="mb-4 p-3 bg-error/10 rounded text-error text-sm">
          Please fix the errors above before submitting.
        </div>
      ) : null}

      {/* Submit */}
      <Button
        className="!rounded-md"
        disabled={submitting || validating}
        onClick={handleSubmit}
      >
        <HiOutlinePlay className="icon-small mr-2" />
        {validating
          ? 'Validating...'
          : submitting
            ? 'Submitting...'
            : 'Submit Job'}
      </Button>
    </div>
  );
}
