import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { Accordion, Button, Tabs, Typography } from '@material-tailwind/react';
import {
  HiChevronDown,
  HiOutlinePlus,
  HiOutlinePlay,
  HiOutlineTrash
} from 'react-icons/hi';

import FileSelectorButton from '@/components/ui/BrowsePage/FileSelector/FileSelectorButton';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { validatePaths } from '@/queries/appsQueries';
import { useClusterDefaultsQuery } from '@/queries/jobsQueries';
import { convertBackToForwardSlash } from '@/utils/pathHandling';
import { flattenParameters, isParameterSection } from '@/shared.types';
import type {
  AppEntryPoint,
  AppManifest,
  AppParameter,
  AppParameterSection,
  AppResourceDefaults
} from '@/shared.types';

interface AppLaunchFormProps {
  readonly manifest: AppManifest;
  readonly entryPoint: AppEntryPoint;
  readonly onSubmit: (
    parameters: Record<string, unknown>,
    resources?: AppResourceDefaults,
    extraArgs?: string,
    pullLatest?: boolean,
    env?: Record<string, string>,
    preRun?: string,
    postRun?: string,
    container?: string,
    containerArgs?: string
  ) => Promise<void>;
  readonly submitting: boolean;
  readonly initialValues?: Record<string, unknown>;
  readonly initialResources?: AppResourceDefaults;
  readonly initialExtraArgs?: string;
  readonly initialEnv?: Record<string, string>;
  readonly initialPreRun?: string;
  readonly initialPostRun?: string;
  readonly initialPullLatest?: boolean;
  readonly initialContainer?: string;
  readonly initialContainerArgs?: string;
}

type EnvVar = { key: string; value: string };

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

function ParameterFieldRow({
  param,
  value,
  error,
  onChange
}: {
  readonly param: AppParameter;
  readonly value: unknown;
  readonly error?: string;
  readonly onChange: (value: unknown) => void;
}) {
  return (
    <div>
      {param.type !== 'boolean' ? (
        <label
          className="block text-foreground text-sm font-medium mb-1"
          htmlFor={`param-${param.key}`}
        >
          {param.name}
          {param.required ? <span className="text-error ml-1">*</span> : null}
        </label>
      ) : null}
      {param.description && param.type !== 'boolean' ? (
        <Typography className="text-secondary mb-1" type="small">
          {param.description}
        </Typography>
      ) : null}
      <ParameterField onChange={onChange} param={param} value={value} />
      {param.description && param.type === 'boolean' ? (
        <Typography className="text-secondary mt-1" type="small">
          {param.description}
        </Typography>
      ) : null}
      {error ? (
        <Typography className="text-error mt-1" type="small">
          {error}
        </Typography>
      ) : null}
    </div>
  );
}

function SectionContent({
  section,
  values,
  errors,
  onParamChange
}: {
  readonly section: AppParameterSection;
  readonly values: Record<string, unknown>;
  readonly errors: Record<string, string>;
  readonly onParamChange: (paramId: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-4">
      {section.parameters.map(param => (
        <ParameterFieldRow
          error={errors[param.key]}
          key={param.key}
          onChange={val => onParamChange(param.key, val)}
          param={param}
          value={values[param.key]}
        />
      ))}
    </div>
  );
}

function EnvVarRows({
  envVars,
  setEnvVars
}: {
  readonly envVars: EnvVar[];
  readonly setEnvVars: Dispatch<SetStateAction<EnvVar[]>>;
}) {
  return (
    <div>
      <label className="block text-foreground text-sm font-medium mb-1">
        Environment Variables
      </label>
      <Typography className="text-secondary mb-2" type="small">
        Variables exported in the job script before the command runs
      </Typography>
      {envVars.map((envVar, idx) => (
        <div className="flex gap-2 mb-2 items-center" key={idx}>
          <input
            className="flex-1 p-2 text-foreground border rounded-sm focus:outline-none bg-background border-primary-light focus:border-primary font-mono text-sm"
            onChange={e =>
              setEnvVars(prev =>
                prev.map((v, i) =>
                  i === idx ? { ...v, key: e.target.value } : v
                )
              )
            }
            placeholder="NAME"
            type="text"
            value={envVar.key}
          />
          <span className="text-secondary">=</span>
          <input
            className="flex-[2] p-2 text-foreground border rounded-sm focus:outline-none bg-background border-primary-light focus:border-primary font-mono text-sm"
            onChange={e =>
              setEnvVars(prev =>
                prev.map((v, i) =>
                  i === idx ? { ...v, value: e.target.value } : v
                )
              )
            }
            placeholder="value"
            type="text"
            value={envVar.value}
          />
          <button
            className="p-1 text-secondary hover:text-error transition-colors"
            onClick={() => setEnvVars(prev => prev.filter((_, i) => i !== idx))}
            title="Remove variable"
            type="button"
          >
            <HiOutlineTrash className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        className="flex items-center gap-1 text-sm text-primary hover:text-primary-dark transition-colors"
        onClick={() => setEnvVars(prev => [...prev, { key: '', value: '' }])}
        type="button"
      >
        <HiOutlinePlus className="h-4 w-4" />
        Add variable
      </button>
    </div>
  );
}

function EnvironmentSectionContent({
  envVars,
  setEnvVars,
  preRun,
  setPreRun,
  postRun,
  setPostRun
}: {
  readonly envVars: EnvVar[];
  readonly setEnvVars: Dispatch<SetStateAction<EnvVar[]>>;
  readonly preRun: string;
  readonly setPreRun: Dispatch<SetStateAction<string>>;
  readonly postRun: string;
  readonly setPostRun: Dispatch<SetStateAction<string>>;
}) {
  const textareaClass =
    'w-full p-2 text-foreground border rounded-sm focus:outline-none bg-background border-primary-light focus:border-primary font-mono text-sm';

  return (
    <div className="space-y-4">
      <EnvVarRows envVars={envVars} setEnvVars={setEnvVars} />

      <div>
        <label className="block text-foreground text-sm font-medium mb-1">
          Pre-run Script
        </label>
        <Typography className="text-secondary mb-1" type="small">
          Shell commands to run before the main command (e.g. module loads)
        </Typography>
        <textarea
          className={textareaClass}
          onChange={e => setPreRun(e.target.value)}
          placeholder="module load java/21"
          rows={3}
          value={preRun}
        />
      </div>

      <div>
        <label className="block text-foreground text-sm font-medium mb-1">
          Post-run Script
        </label>
        <Typography className="text-secondary mb-1" type="small">
          Shell commands to run after the main command completes
        </Typography>
        <textarea
          className={textareaClass}
          onChange={e => setPostRun(e.target.value)}
          placeholder='echo "Done"'
          rows={3}
          value={postRun}
        />
      </div>
    </div>
  );
}

function ResourcesSectionContent({
  resources,
  setResources
}: {
  readonly resources: AppResourceDefaults;
  readonly setResources: Dispatch<SetStateAction<AppResourceDefaults>>;
}) {
  const inputClass =
    'w-full p-2 text-foreground border rounded-sm focus:outline-none bg-background border-primary-light focus:border-primary';

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-foreground text-sm font-medium mb-1">
          CPUs
        </label>
        <Typography className="text-secondary mb-1" type="small">
          Number of CPU cores to allocate for the job
        </Typography>
        <input
          className={inputClass}
          min={1}
          onChange={e =>
            setResources(prev => ({
              ...prev,
              cpus: e.target.value ? parseInt(e.target.value) : undefined
            }))
          }
          placeholder="e.g. 4"
          type="number"
          value={resources.cpus ?? ''}
        />
      </div>
      <div>
        <label className="block text-foreground text-sm font-medium mb-1">
          Memory
        </label>
        <Typography className="text-secondary mb-1" type="small">
          Amount of RAM to allocate (e.g. &quot;16 GB&quot;, &quot;512 MB&quot;)
        </Typography>
        <input
          className={inputClass}
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
          Time Limit
        </label>
        <Typography className="text-secondary mb-1" type="small">
          Maximum run time before the job is killed (HH:MM format)
        </Typography>
        <input
          className={inputClass}
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
  );
}

function SubmitOptionsSectionContent({
  resources,
  setResources,
  extraArgs,
  setExtraArgs
}: {
  readonly resources: AppResourceDefaults;
  readonly setResources: Dispatch<SetStateAction<AppResourceDefaults>>;
  readonly extraArgs: string;
  readonly setExtraArgs: Dispatch<SetStateAction<string>>;
}) {
  const inputClass =
    'w-full p-2 text-foreground border rounded-sm focus:outline-none bg-background border-primary-light focus:border-primary';

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-foreground text-sm font-medium mb-1">
          Queue
        </label>
        <Typography className="text-secondary mb-1" type="small">
          Cluster queue/partition to submit the job to
        </Typography>
        <input
          className={inputClass}
          onChange={e =>
            setResources(prev => ({
              ...prev,
              queue: e.target.value || undefined
            }))
          }
          placeholder="e.g. normal"
          type="text"
          value={resources.queue ?? ''}
        />
      </div>
      <div>
        <label className="block text-foreground text-sm font-medium mb-1">
          Extra Arguments
        </label>
        <Typography className="text-secondary mb-1" type="small">
          Additional CLI arguments for the submit command
        </Typography>
        <input
          className={`max-w-md ${inputClass} font-mono text-sm`}
          onChange={e => setExtraArgs(e.target.value)}
          placeholder='e.g. -P your_project -R "select[mem>8000]"'
          type="text"
          value={extraArgs}
        />
      </div>
    </div>
  );
}

function EnvironmentTabContent({
  envVars,
  setEnvVars,
  preRun,
  setPreRun,
  postRun,
  setPostRun,
  openEnvSections,
  setOpenEnvSections,
  entryPoint,
  containerImage,
  setContainerImage,
  containerArgs,
  setContainerArgs
}: {
  readonly envVars: EnvVar[];
  readonly setEnvVars: Dispatch<SetStateAction<EnvVar[]>>;
  readonly preRun: string;
  readonly setPreRun: Dispatch<SetStateAction<string>>;
  readonly postRun: string;
  readonly setPostRun: Dispatch<SetStateAction<string>>;
  readonly openEnvSections: string[];
  readonly setOpenEnvSections: Dispatch<SetStateAction<string[]>>;
  readonly entryPoint: AppEntryPoint;
  readonly containerImage: string;
  readonly setContainerImage: Dispatch<SetStateAction<string>>;
  readonly containerArgs: string;
  readonly setContainerArgs: Dispatch<SetStateAction<string>>;
}) {
  const inputClass =
    'w-full p-2 text-foreground border rounded-sm focus:outline-none bg-background border-primary-light focus:border-primary';

  return (
    <Accordion
      onValueChange={
        setOpenEnvSections as Dispatch<SetStateAction<string | string[]>>
      }
      type="multiple"
      value={openEnvSections}
    >
      <Accordion.Item value="environment">
        <Accordion.Trigger className="flex w-full items-center justify-between py-3 border-b border-primary-light">
          <div className="text-foreground font-bold text-sm">Environment</div>
          <HiChevronDown
            className={`h-4 w-4 text-secondary transition-transform ${
              openEnvSections.includes('environment') ? 'rotate-180' : ''
            }`}
          />
        </Accordion.Trigger>
        <Accordion.Content className="pt-4 pb-2 pl-4">
          <EnvironmentSectionContent
            envVars={envVars}
            postRun={postRun}
            preRun={preRun}
            setEnvVars={setEnvVars}
            setPostRun={setPostRun}
            setPreRun={setPreRun}
          />
        </Accordion.Content>
      </Accordion.Item>

      {entryPoint.container ? (
        <Accordion.Item value="apptainer">
          <Accordion.Trigger className="flex w-full items-center justify-between py-3 border-b border-primary-light">
            <div className="text-foreground font-bold text-sm">Container</div>
            <HiChevronDown
              className={`h-4 w-4 text-secondary transition-transform ${
                openEnvSections.includes('apptainer') ? 'rotate-180' : ''
              }`}
            />
          </Accordion.Trigger>
          <Accordion.Content className="pt-4 pb-2 pl-4">
            <div className="space-y-4">
              <div>
                <label className="block text-foreground text-sm font-medium mb-1">
                  Container Image
                </label>
                <input
                  className={`max-w-md ${inputClass} font-mono text-sm`}
                  onChange={e => setContainerImage(e.target.value)}
                  placeholder="e.g. ghcr.io/org/image:tag"
                  type="text"
                  value={containerImage}
                />
              </div>
              <div>
                <label className="block text-foreground text-sm font-medium mb-1">
                  Extra Apptainer Arguments
                </label>
                <Typography className="text-secondary mb-1" type="small">
                  Additional flags passed to apptainer exec
                </Typography>
                <input
                  className={`max-w-md ${inputClass} font-mono text-sm`}
                  onChange={e => setContainerArgs(e.target.value)}
                  placeholder="e.g. --nv"
                  type="text"
                  value={containerArgs}
                />
              </div>
            </div>
          </Accordion.Content>
        </Accordion.Item>
      ) : null}
    </Accordion>
  );
}

function ClusterTabContent({
  resources,
  setResources,
  extraArgs,
  setExtraArgs,
  openClusterSections,
  setOpenClusterSections
}: {
  readonly resources: AppResourceDefaults;
  readonly setResources: Dispatch<SetStateAction<AppResourceDefaults>>;
  readonly extraArgs: string;
  readonly setExtraArgs: Dispatch<SetStateAction<string>>;
  readonly openClusterSections: string[];
  readonly setOpenClusterSections: Dispatch<SetStateAction<string[]>>;
}) {
  return (
    <Accordion
      onValueChange={
        setOpenClusterSections as Dispatch<SetStateAction<string | string[]>>
      }
      type="multiple"
      value={openClusterSections}
    >
      <Accordion.Item value="resources">
        <Accordion.Trigger className="flex w-full items-center justify-between py-3 border-b border-primary-light">
          <div className="text-foreground font-bold text-sm">Resources</div>
          <HiChevronDown
            className={`h-4 w-4 text-secondary transition-transform ${
              openClusterSections.includes('resources') ? 'rotate-180' : ''
            }`}
          />
        </Accordion.Trigger>
        <Accordion.Content className="pt-4 pb-2 pl-4">
          <ResourcesSectionContent
            resources={resources}
            setResources={setResources}
          />
        </Accordion.Content>
      </Accordion.Item>

      <Accordion.Item value="submitOptions">
        <Accordion.Trigger className="flex w-full items-center justify-between py-3 border-b border-primary-light">
          <div className="text-foreground font-bold text-sm">
            Submit Options
          </div>
          <HiChevronDown
            className={`h-4 w-4 text-secondary transition-transform ${
              openClusterSections.includes('submitOptions') ? 'rotate-180' : ''
            }`}
          />
        </Accordion.Trigger>
        <Accordion.Content className="pt-4 pb-2 pl-4">
          <SubmitOptionsSectionContent
            extraArgs={extraArgs}
            resources={resources}
            setExtraArgs={setExtraArgs}
            setResources={setResources}
          />
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  );
}

export default function AppLaunchForm({
  manifest,
  entryPoint,
  onSubmit,
  submitting,
  initialValues: externalValues,
  initialResources,
  initialExtraArgs: externalExtraArgs,
  initialEnv,
  initialPreRun,
  initialPostRun,
  initialPullLatest,
  initialContainer,
  initialContainerArgs
}: AppLaunchFormProps) {
  const { defaultExtraArgs } = usePreferencesContext();
  const clusterDefaultsQuery = useClusterDefaultsQuery();
  const allParams = flattenParameters(entryPoint.parameters);

  // Initialize parameter values: external values override defaults
  const defaultValues: Record<string, unknown> = {};
  for (const param of allParams) {
    if (param.default !== undefined) {
      defaultValues[param.key] = param.default;
    }
  }
  const startingValues = externalValues
    ? { ...defaultValues, ...externalValues }
    : defaultValues;

  // Compute which sections start open (those without collapsed: true)
  const initialOpenSections = entryPoint.parameters
    .filter(item => isParameterSection(item) && !item.collapsed)
    .map(item => (item as AppParameterSection).section);

  // extra_args priority: relaunch > user preference > config.yaml
  const configExtraArgs = clusterDefaultsQuery.data?.extra_args ?? '';
  const resolvedExtraArgs =
    externalExtraArgs ?? (defaultExtraArgs || configExtraArgs);

  const [values, setValues] = useState<Record<string, unknown>>(startingValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState('parameters');
  const [pullLatest, setPullLatest] = useState(initialPullLatest ?? false);
  const [openSections, setOpenSections] =
    useState<string[]>(initialOpenSections);
  const [resources, setResources] = useState<AppResourceDefaults>(
    initialResources ?? {
      cpus: entryPoint.resources?.cpus,
      memory: entryPoint.resources?.memory,
      walltime: entryPoint.resources?.walltime,
      queue: entryPoint.resources?.queue
    }
  );
  const [extraArgs, setExtraArgs] = useState<string>(resolvedExtraArgs);

  // Update extraArgs when async data (preferences or cluster defaults) arrives,
  // but only if not a relaunch and the user hasn't modified the field yet
  useEffect(() => {
    if (externalExtraArgs !== undefined) {
      return; // relaunch value takes priority, don't overwrite
    }
    const resolved = defaultExtraArgs || configExtraArgs;
    if (resolved) {
      setExtraArgs(prev => (prev === '' ? resolved : prev));
    }
  }, [defaultExtraArgs, configExtraArgs, externalExtraArgs]);

  // Environment tab state — relaunch values override entry point defaults
  const [envVars, setEnvVars] = useState<EnvVar[]>(() => {
    const source = initialEnv ?? entryPoint.env;
    if (source) {
      return Object.entries(source).map(([key, value]) => ({ key, value }));
    }
    return [];
  });
  const [preRun, setPreRun] = useState(
    initialPreRun ?? entryPoint.pre_run ?? ''
  );
  const [postRun, setPostRun] = useState(
    initialPostRun ?? entryPoint.post_run ?? ''
  );
  const [containerImage, setContainerImage] = useState(
    initialContainer ?? entryPoint.container ?? ''
  );
  const [containerArgs, setContainerArgs] = useState(
    initialContainerArgs ?? entryPoint.container_args ?? ''
  );
  const [openEnvSections, setOpenEnvSections] = useState<string[]>(
    entryPoint.container ? ['environment', 'apptainer'] : ['environment']
  );
  const [openClusterSections, setOpenClusterSections] = useState<string[]>([
    'resources',
    'submitOptions'
  ]);

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
    for (const param of allParams) {
      const val = values[param.key];
      if (param.required && (val === undefined || val === null || val === '')) {
        newErrors[param.key] = `${param.name} is required`;
      }
      if (
        val !== undefined &&
        val !== null &&
        val !== '' &&
        (param.type === 'integer' || param.type === 'number')
      ) {
        const numVal = Number(val);
        if (isNaN(numVal)) {
          newErrors[param.key] = `${param.name} must be a valid number`;
        } else {
          if (param.min !== undefined && numVal < param.min) {
            newErrors[param.key] =
              `${param.name} must be at least ${param.min}`;
          }
          if (param.max !== undefined && numVal > param.max) {
            newErrors[param.key] = `${param.name} must be at most ${param.max}`;
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
          newErrors[param.key] =
            `${param.name} must be an absolute path (starting with / or ~)`;
        }
      }
    }
    setErrors(newErrors);

    // Auto-expand sections that contain errors
    if (Object.keys(newErrors).length > 0) {
      const sectionsToOpen = new Set(openSections);
      for (const item of entryPoint.parameters) {
        if (
          isParameterSection(item) &&
          item.parameters.some(p => newErrors[p.key])
        ) {
          sectionsToOpen.add(item.section);
        }
      }
      setOpenSections([...sectionsToOpen]);
    }

    return Object.keys(newErrors).length === 0;
  };

  const [validating, setValidating] = useState(false);

  const handleSubmit = async () => {
    if (!validate()) {
      return;
    }

    // Build a lookup of parameter definitions
    const paramDefs = new Map(allParams.map(p => [p.key, p]));

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

    // Only pass resources if user provided values
    const hasResourceOverrides =
      resources.cpus ||
      resources.memory ||
      resources.walltime ||
      resources.queue;

    // Convert envVars array to Record, filtering empty keys
    const envRecord: Record<string, string> = {};
    for (const { key, value } of envVars) {
      if (key.trim()) {
        envRecord[key.trim()] = value;
      }
    }
    const hasEnv = Object.keys(envRecord).length > 0;

    await onSubmit(
      params,
      hasResourceOverrides ? resources : undefined,
      extraArgs.trim() || undefined,
      pullLatest,
      hasEnv ? envRecord : undefined,
      preRun.trim() || undefined,
      postRun.trim() || undefined,
      containerImage.trim() || undefined,
      containerArgs.trim() || undefined
    );
  };

  const hasSections = entryPoint.parameters.some(isParameterSection);

  return (
    <div>
      <Typography className="text-foreground font-bold mb-1" type="h5">
        {entryPoint.name}
      </Typography>
      <Typography className="text-secondary block mb-4" type="small">
        {manifest.name}
        {manifest.version ? ` v${manifest.version}` : ''}
      </Typography>
      {entryPoint.description ? (
        <Typography className="text-secondary block mb-4" type="small">
          {entryPoint.description}
        </Typography>
      ) : null}

      {/* Tabs */}
      <Tabs onValueChange={setActiveTab} value={activeTab}>
        <Tabs.List className="justify-start items-stretch shrink-0 min-w-fit w-full py-2 bg-surface dark:bg-surface-light">
          <Tabs.Trigger className="!text-foreground h-full" value="parameters">
            Parameters
          </Tabs.Trigger>
          <Tabs.Trigger className="!text-foreground h-full" value="environment">
            Environment
          </Tabs.Trigger>
          <Tabs.Trigger className="!text-foreground h-full" value="cluster">
            Cluster
          </Tabs.Trigger>
          <Tabs.TriggerIndicator className="h-full" />
        </Tabs.List>

        <Tabs.Panel className="pt-4" value="parameters">
          <div className="max-w-2xl space-y-4">
            {hasSections ? (
              <Accordion
                onValueChange={
                  setOpenSections as Dispatch<SetStateAction<string | string[]>>
                }
                type="multiple"
                value={openSections}
              >
                {entryPoint.parameters.map(item =>
                  isParameterSection(item) ? (
                    <Accordion.Item
                      key={`section-${item.section}`}
                      value={item.section}
                    >
                      <Accordion.Trigger className="flex w-full items-center justify-between py-3 border-b border-primary-light">
                        <div className="text-left">
                          <div className="text-foreground font-medium text-sm">
                            {item.section}
                          </div>
                          {item.description ? (
                            <Typography className="text-secondary" type="small">
                              {item.description}
                            </Typography>
                          ) : null}
                        </div>
                        <HiChevronDown
                          className={`h-4 w-4 text-secondary transition-transform ${
                            openSections.includes(item.section)
                              ? 'rotate-180'
                              : ''
                          }`}
                        />
                      </Accordion.Trigger>
                      <Accordion.Content className="pt-4 pb-2 pl-4">
                        <SectionContent
                          errors={errors}
                          onParamChange={handleChange}
                          section={item}
                          values={values}
                        />
                      </Accordion.Content>
                    </Accordion.Item>
                  ) : (
                    <ParameterFieldRow
                      error={errors[item.key]}
                      key={item.key}
                      onChange={val => handleChange(item.key, val)}
                      param={item}
                      value={values[item.key]}
                    />
                  )
                )}
              </Accordion>
            ) : (
              entryPoint.parameters.map(item =>
                isParameterSection(item) ? null : (
                  <ParameterFieldRow
                    error={errors[item.key]}
                    key={item.key}
                    onChange={val => handleChange(item.key, val)}
                    param={item}
                    value={values[item.key]}
                  />
                )
              )
            )}
          </div>
        </Tabs.Panel>

        <Tabs.Panel className="pt-4 max-w-2xl" value="environment">
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

          <EnvironmentTabContent
            containerArgs={containerArgs}
            containerImage={containerImage}
            entryPoint={entryPoint}
            envVars={envVars}
            openEnvSections={openEnvSections}
            postRun={postRun}
            preRun={preRun}
            setContainerArgs={setContainerArgs}
            setContainerImage={setContainerImage}
            setEnvVars={setEnvVars}
            setOpenEnvSections={setOpenEnvSections}
            setPostRun={setPostRun}
            setPreRun={setPreRun}
          />
        </Tabs.Panel>

        <Tabs.Panel className="pt-4 max-w-2xl" value="cluster">
          <ClusterTabContent
            extraArgs={extraArgs}
            openClusterSections={openClusterSections}
            resources={resources}
            setExtraArgs={setExtraArgs}
            setOpenClusterSections={setOpenClusterSections}
            setResources={setResources}
          />
        </Tabs.Panel>
      </Tabs>

      {/* Validation error summary */}
      {Object.keys(errors).length > 0 ? (
        <div className="mt-6 mb-4 p-3 bg-error/10 rounded text-error text-sm">
          Please fix the errors above before submitting.
        </div>
      ) : null}

      {/* Submit */}
      <Button
        className="!rounded-md mt-6"
        disabled={submitting || validating}
        onClick={handleSubmit}
      >
        <HiOutlinePlay className="icon-small mr-2" />
        {validating
          ? 'Validating...'
          : submitting
            ? 'Submitting...'
            : entryPoint.type === 'service'
              ? 'Start Service'
              : 'Submit Job'}
      </Button>
    </div>
  );
}
