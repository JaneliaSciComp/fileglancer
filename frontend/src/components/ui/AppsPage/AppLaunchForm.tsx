import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { Accordion, Tabs, Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';
import {
  HiChevronDown,
  HiOutlineDownload,
  HiOutlinePlus,
  HiOutlinePlay,
  HiOutlineTrash,
  HiOutlineUpload
} from 'react-icons/hi';

import FgButton from '@/components/designSystem/atoms/FgButton';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FileSelectorButton from '@/components/ui/FileSelector/FileSelectorButton';
import FgSwitch from '@/components/ui/widgets/FgSwitch';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { validatePaths } from '@/queries/appsQueries';
import { useClusterDefaultsQuery } from '@/queries/jobsQueries';
import { downloadTextFile } from '@/utils';
import {
  convertBackToForwardSlash,
  resolvePathToFsp
} from '@/utils/pathHandling';
import {
  flattenParameters,
  isParameterSection,
  parseAppLaunchParamsFile
} from '@/shared.types';
import type {
  AppEntryPoint,
  AppLaunchParamsFile,
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
    envParameters: Record<string, unknown>,
    resources?: AppResourceDefaults,
    extraArgs?: string,
    env?: Record<string, string>,
    preRun?: string,
    postRun?: string,
    container?: string,
    containerArgs?: string
  ) => void;
  readonly submitting: boolean;
  readonly submitError?: string;
  readonly initialValues?: Record<string, unknown>;
  readonly initialEnvParameters?: Record<string, unknown>;
  readonly initialResources?: AppResourceDefaults;
  readonly initialExtraArgs?: string;
  readonly initialEnv?: Record<string, string>;
  readonly initialPreRun?: string;
  readonly initialPostRun?: string;
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
  // For file/directory fields, track a display-formatted path separately from
  // the server-formatted value used for submission. When the user selects a
  // path via the file selector, the display path uses their OS preference
  // (e.g. Windows backslashes) while the stored value stays in server format.
  // Manual edits clear the override so the input shows exactly what was typed.
  const [fileDisplayPath, setFileDisplayPath] = useState<string | null>(null);

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
          <span className="text-foreground text-sm font-semibold">
            {param.name}
          </span>
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
          placeholder={param.name}
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
            onChange={e => {
              setFileDisplayPath(null);
              onChange(e.target.value);
            }}
            placeholder={`Select a ${param.type}...`}
            type="text"
            value={
              fileDisplayPath ??
              (value !== undefined && value !== null ? String(value) : '')
            }
          />
          <FileSelectorButton
            initialPath={
              typeof value === 'string' &&
              !value.startsWith('s3://') &&
              !value.startsWith('gs://') &&
              !value.startsWith('https://')
                ? value
                : undefined
            }
            label="Browse..."
            mode={param.type === 'file' ? 'file' : 'directory'}
            onSelect={(serverPath, displayPath) => {
              onChange(serverPath);
              setFileDisplayPath(displayPath);
            }}
            useServerPath
          />
        </div>
      );

    default:
      return (
        <input
          className={baseInputClass}
          onChange={e => onChange(e.target.value)}
          placeholder={param.name}
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
          className="block text-foreground text-sm font-semibold mb-1"
          htmlFor={`param-${param.key}`}
        >
          {param.name}
          {param.required ? <span className="text-error ml-1">*</span> : null}
        </label>
      ) : null}
      {param.description && param.type !== 'boolean' ? (
        <Typography className="text-foreground mb-1" type="small">
          {param.description}
        </Typography>
      ) : null}
      <ParameterField onChange={onChange} param={param} value={value} />
      {param.description && param.type === 'boolean' ? (
        <Typography className="text-foreground mt-1" type="small">
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

// Trigger for a collapsible section. The title and description live in the
// trigger (not the content) so the description stays visible when collapsed.
// items-start keeps the chevron aligned with the title line rather than
// centered against the title + description block.
function SectionTrigger({
  title,
  description,
  isOpen
}: {
  readonly title: string;
  readonly description?: string;
  readonly isOpen: boolean;
}) {
  return (
    <Accordion.Trigger className="flex w-full items-start justify-between gap-2 py-4">
      <div className="text-left">
        <div className="text-foreground font-bold text-sm">{title}</div>
        {description ? (
          <Typography className="text-foreground" type="small">
            {description}
          </Typography>
        ) : null}
      </div>
      <FgIcon
        className={`text-foreground transition-transform shrink-0 mt-0.5 ${
          isOpen ? 'rotate-180' : ''
        }`}
        icon={HiChevronDown}
        size="sm"
      />
    </Accordion.Trigger>
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
      <label className="block text-foreground text-sm font-semibold mb-1">
        Environment Variables
      </label>
      <Typography className="text-foreground mb-2" type="small">
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
          <span className="text-foreground">=</span>
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
            className="p-1 text-foreground hover:text-error transition-colors"
            onClick={() => setEnvVars(prev => prev.filter((_, i) => i !== idx))}
            title="Remove variable"
            type="button"
          >
            <FgIcon icon={HiOutlineTrash} size="sm" />
          </button>
        </div>
      ))}
      <FgButton
        icon={HiOutlinePlus}
        onClick={() => setEnvVars(prev => [...prev, { key: '', value: '' }])}
        size="sm"
        variant="ghost"
      >
        Add variable
      </FgButton>
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
        <label className="block text-foreground text-sm font-semibold mb-1">
          Pre-run Script
        </label>
        <Typography className="text-foreground mb-1" type="small">
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
        <label className="block text-foreground text-sm font-semibold mb-1">
          Post-run Script
        </label>
        <Typography className="text-foreground mb-1" type="small">
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
        <label className="block text-foreground text-sm font-semibold mb-1">
          CPUs
        </label>
        <Typography className="text-foreground mb-1" type="small">
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
        <label className="block text-foreground text-sm font-semibold mb-1">
          Memory
        </label>
        <Typography className="text-foreground mb-1" type="small">
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
        <label className="block text-foreground text-sm font-semibold mb-1">
          Time Limit
        </label>
        <Typography className="text-foreground mb-1" type="small">
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
        <label className="block text-foreground text-sm font-semibold mb-1">
          Queue
        </label>
        <Typography className="text-foreground mb-1" type="small">
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
        <label className="block text-foreground text-sm font-semibold mb-1">
          Extra Arguments
        </label>
        <Typography className="text-foreground mb-1" type="small">
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
        <SectionTrigger
          description="Set up the environment that the job runs in. This controls the script that is submitted to the cluster."
          isOpen={openEnvSections.includes('environment')}
          title="Environment"
        />
        <Accordion.Content className="pt-2 pb-4 pl-4">
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
          <SectionTrigger
            description="Run the command inside an Apptainer (Singularity) container image."
            isOpen={openEnvSections.includes('apptainer')}
            title="Container"
          />
          <Accordion.Content className="pt-2 pb-4 pl-4">
            <div className="space-y-4">
              <div>
                <label className="block text-foreground text-sm font-semibold mb-1">
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
                <label className="block text-foreground text-sm font-semibold mb-1">
                  Extra Apptainer Arguments
                </label>
                <Typography className="text-foreground mb-1" type="small">
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
        <SectionTrigger
          description="These resources are requested for the single process that runs your command. These apply to the main job only, not to any jobs it submits on its own."
          isOpen={openClusterSections.includes('resources')}
          title="Resources"
        />
        <Accordion.Content className="pt-2 pb-4 pl-4">
          <ResourcesSectionContent
            resources={resources}
            setResources={setResources}
          />
        </Accordion.Content>
      </Accordion.Item>

      <Accordion.Item value="submitOptions">
        <SectionTrigger
          description="Controls how the main job is submitted to the cluster scheduler, such as the queue and any extra scheduler options. These apply to the main job only, not to any jobs it submits on its own."
          isOpen={openClusterSections.includes('submitOptions')}
          title="Submit Options"
        />
        <Accordion.Content className="pt-2 pb-4 pl-4">
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
  submitError,
  initialValues: externalValues,
  initialEnvParameters: externalEnvValues,
  initialResources,
  initialExtraArgs: externalExtraArgs,
  initialEnv,
  initialPreRun,
  initialPostRun,
  initialContainer,
  initialContainerArgs
}: AppLaunchFormProps) {
  const { defaultExtraArgs } = usePreferencesContext();
  const { zonesAndFspQuery } = useZoneAndFspMapContext();
  const clusterDefaultsQuery = useClusterDefaultsQuery();
  // Pipeline parameters and env-tab parameters are independent namespaces with
  // their own value dicts, so a key may appear in both without colliding.
  const allParams = flattenParameters([...entryPoint.parameters]);
  const envParamsFlat = flattenParameters([
    ...(entryPoint.env_parameters ?? [])
  ]);

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

  const envDefaultValues: Record<string, unknown> = {};
  for (const param of envParamsFlat) {
    if (param.default !== undefined) {
      envDefaultValues[param.key] = param.default;
    }
  }
  const startingEnvValues = externalEnvValues
    ? { ...envDefaultValues, ...externalEnvValues }
    : envDefaultValues;

  // Compute which sections start open (those without collapsed: true)
  const initialOpenSections = entryPoint.parameters
    .filter(item => isParameterSection(item) && !item.collapsed)
    .map(item => (item as AppParameterSection).section);

  // extra_args priority: relaunch > user preference > config.yaml
  const configExtraArgs = clusterDefaultsQuery.data?.extra_args ?? '';
  const resolvedExtraArgs =
    externalExtraArgs ?? (defaultExtraArgs || configExtraArgs);

  const [values, setValues] = useState<Record<string, unknown>>(startingValues);
  const [envValues, setEnvValues] =
    useState<Record<string, unknown>>(startingEnvValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState('parameters');
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
  const [openEnvParamSections, setOpenEnvParamSections] = useState<string[]>(
    (entryPoint.env_parameters ?? [])
      .filter(item => isParameterSection(item) && !item.collapsed)
      .map(item => (item as AppParameterSection).section)
  );
  const [openClusterSections, setOpenClusterSections] = useState<string[]>([
    'resources',
    'submitOptions'
  ]);

  /**
   * Resolve a path in any OS format (Mac smb://, Windows UNC, Linux) to
   * the server's mount_path + subpath. Returns the original value if FSP
   * data isn't loaded or no match is found.
   */
  const resolveToServerPath = (val: string): string => {
    const fspData = zonesAndFspQuery.data;
    if (!fspData) {
      return val;
    }
    const result = resolvePathToFsp(val, fspData);
    if (!result) {
      return val;
    }
    const { fsp, subpath } = result;
    return subpath ? `${fsp.mount_path}/${subpath}` : fsp.mount_path;
  };

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

  // Env-tab params have their own value dict so their keys can't collide with
  // pipeline param keys.
  const handleEnvChange = (paramId: string, value: unknown) => {
    setEnvValues(prev => ({ ...prev, [paramId]: value }));
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
          if (
            param.min !== null &&
            param.min !== undefined &&
            numVal < param.min
          ) {
            newErrors[param.key] =
              `${param.name} must be at least ${param.min}`;
          }
          if (
            param.max !== null &&
            param.max !== undefined &&
            numVal > param.max
          ) {
            newErrors[param.key] = `${param.name} must be at most ${param.max}`;
          }
        }
      }
      // Validate file/directory paths (skip URI schemes like s3://)
      if (
        val !== undefined &&
        val !== null &&
        val !== '' &&
        (param.type === 'file' || param.type === 'directory') &&
        typeof val === 'string'
      ) {
        // Resolve Mac/Windows/alternate-Linux paths to server mount_path
        const resolved = resolveToServerPath(val);
        const normalized = convertBackToForwardSlash(resolved);
        if (
          !normalized.startsWith('s3://') &&
          !normalized.startsWith('gs://') &&
          !normalized.startsWith('https://')
        ) {
          if (normalized.includes('..')) {
            newErrors[param.key] = `${param.name} must not contain '..'`;
          } else if (
            !normalized.startsWith('/') &&
            !normalized.startsWith('~') &&
            !normalized.startsWith('./')
          ) {
            newErrors[param.key] =
              `${param.name} must be an absolute or relative path (starting with /, ~, or ./)`;
          }
        }
      }
    }
    setErrors(newErrors);

    // Auto-expand sections that contain errors and reveal hidden params if needed
    if (Object.keys(newErrors).length > 0) {
      const sectionsToOpen = new Set(openSections);
      let hasHiddenError = false;
      for (const item of entryPoint.parameters) {
        if (isParameterSection(item)) {
          if (item.parameters.some(p => newErrors[p.key])) {
            sectionsToOpen.add(item.section);
          }
          if (item.parameters.some(p => p.hidden && newErrors[p.key])) {
            hasHiddenError = true;
          }
        } else if (item.hidden && newErrors[item.key]) {
          hasHiddenError = true;
        }
      }
      setOpenSections([...sectionsToOpen]);
      if (hasHiddenError) {
        setShowHidden(true);
      }
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
          // Resolve Mac/Windows/alternate-Linux paths to server mount_path
          const resolved = resolveToServerPath(val);
          const normalized = convertBackToForwardSlash(resolved);
          params[key] = normalized;
          // Skip server-side path validation for URI schemes (e.g. s3://)
          if (
            !normalized.startsWith('s3://') &&
            !normalized.startsWith('gs://') &&
            !normalized.startsWith('https://')
          ) {
            pathParams[key] = normalized;
          }
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

    // Env-tab parameter values (separate namespace), dropping empties.
    const envParams: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(envValues)) {
      if (val !== undefined && val !== null && val !== '') {
        envParams[key] = val;
      }
    }

    onSubmit(
      params,
      envParams,
      hasResourceOverrides ? resources : undefined,
      extraArgs.trim() || undefined,
      hasEnv ? envRecord : undefined,
      preRun.trim() || undefined,
      postRun.trim() || undefined,
      containerImage.trim() || undefined,
      containerArgs.trim() || undefined
    );
  };

  const [showHidden, setShowHidden] = useState(false);

  // Check if any parameters are marked as hidden
  const hasHiddenParams = allParams.some(p => p.hidden);

  // Filter out hidden parameters from display when toggle is off
  const filterHiddenParams = (params: AppParameter[]) =>
    showHidden ? params : params.filter(p => !p.hidden);

  const visibleParameters = entryPoint.parameters
    .map(item => {
      if (isParameterSection(item)) {
        const filteredParams = filterHiddenParams(item.parameters);
        // Hide the section entirely if all its parameters are hidden
        if (filteredParams.length === 0) {
          return null;
        }
        return { ...item, parameters: filteredParams };
      }
      if (!showHidden && item.hidden) {
        return null;
      }
      return item;
    })
    .filter(Boolean) as (AppParameter | AppParameterSection)[];

  const hasSections = visibleParameters.some(isParameterSection);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export the current form state (all three tabs) as a downloadable JSON file.
  // Uses the raw values the user entered (no path normalization) so that
  // re-importing reproduces the form exactly.
  const handleExport = () => {
    const envRecord: Record<string, string> = {};
    for (const { key, value } of envVars) {
      if (key.trim()) {
        envRecord[key.trim()] = value;
      }
    }

    const params: AppLaunchParamsFile = {};
    if (Object.keys(values).length > 0) {
      params.parameters = values;
    }
    if (Object.keys(envValues).length > 0) {
      params.env_parameters = envValues;
    }
    if (
      resources.cpus ||
      resources.memory ||
      resources.walltime ||
      resources.queue
    ) {
      params.resources = resources;
    }
    if (extraArgs.trim()) {
      params.extra_args = extraArgs;
    }
    if (Object.keys(envRecord).length > 0) {
      params.env = envRecord;
    }
    if (preRun.trim()) {
      params.pre_run = preRun;
    }
    if (postRun.trim()) {
      params.post_run = postRun;
    }
    if (containerImage.trim()) {
      params.container = containerImage;
    }
    if (containerArgs.trim()) {
      params.container_args = containerArgs;
    }

    downloadTextFile(
      JSON.stringify(params, null, 2),
      `${entryPoint.id || entryPoint.name}-params.json`
    );
  };

  // Populate the form from an uploaded JSON file. Only keys present in the file
  // are applied, so a partial file may target any subset of the three tabs.
  const handleImportFile = async (file: File) => {
    let parsed: AppLaunchParamsFile;
    try {
      parsed = parseAppLaunchParamsFile(await file.text());
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to read parameters file'
      );
      return;
    }

    if (parsed.parameters) {
      setValues(prev => ({ ...prev, ...parsed.parameters }));
    }
    if (parsed.env_parameters) {
      setEnvValues(prev => ({ ...prev, ...parsed.env_parameters }));
    }
    if (parsed.resources) {
      setResources(prev => ({ ...prev, ...parsed.resources }));
    }
    if (parsed.extra_args !== undefined) {
      setExtraArgs(parsed.extra_args);
    }
    if (parsed.env) {
      setEnvVars(
        Object.entries(parsed.env).map(([key, value]) => ({ key, value }))
      );
    }
    if (parsed.pre_run !== undefined) {
      setPreRun(parsed.pre_run);
    }
    if (parsed.post_run !== undefined) {
      setPostRun(parsed.post_run);
    }
    if (parsed.container !== undefined) {
      setContainerImage(parsed.container);
    }
    if (parsed.container_args !== undefined) {
      setContainerArgs(parsed.container_args);
    }

    setErrors({});
    toast.success('Parameters loaded');
  };

  const actionButtons = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <FgButton
        className="!rounded-md whitespace-nowrap"
        icon={HiOutlineDownload}
        onClick={handleExport}
        variant="outline"
      >
        Export params
      </FgButton>
      <FgButton
        className="!rounded-md whitespace-nowrap"
        icon={HiOutlineUpload}
        onClick={() => fileInputRef.current?.click()}
        variant="outline"
      >
        Upload params file
      </FgButton>
      <FgButton
        className="!rounded-md whitespace-nowrap"
        disabled={validating || submitting}
        icon={HiOutlinePlay}
        loading={validating || submitting}
        loadingText={validating ? 'Validating...' : 'Submitting...'}
        onClick={handleSubmit}
      >
        {entryPoint.type === 'service' ? 'Start Service' : 'Submit Job'}
      </FgButton>
    </div>
  );

  // Shown next to both the top and bottom submit buttons, so the user sees the
  // error regardless of which button they used. Wording is direction-neutral
  // since the same banner appears above and below the fields.
  const submitErrorBanner = submitError ? (
    <div className="mt-2 mb-4 p-3 bg-error/10 rounded text-error text-sm">
      {submitError}
    </div>
  ) : null;
  const validationErrorBanner =
    Object.keys(errors).length > 0 ? (
      <div className="mt-2 mb-4 p-3 bg-error/10 rounded text-error text-sm">
        Please fix the highlighted errors before submitting.
      </div>
    ) : null;

  return (
    <div>
      <input
        accept="application/json,.json"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) {
            void handleImportFile(file);
          }
          // Reset so selecting the same file again re-triggers onChange
          e.target.value = '';
        }}
        ref={fileInputRef}
        type="file"
      />
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <Typography className="font-bold mb-1" type="h5">
            {entryPoint.name}
          </Typography>
          <Typography className="block">{manifest.name}</Typography>
        </div>
        {actionButtons}
      </div>
      {/* Errors (top) */}
      {validationErrorBanner}
      {submitErrorBanner}
      {entryPoint.description ? (
        <Typography className="block mb-6">{entryPoint.description}</Typography>
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
          <div className="flex items-start gap-4">
            <div className="max-w-2xl grow space-y-4">
              {hasSections ? (
                <Accordion
                  onValueChange={
                    setOpenSections as Dispatch<
                      SetStateAction<string | string[]>
                    >
                  }
                  type="multiple"
                  value={openSections}
                >
                  {visibleParameters.map(item =>
                    isParameterSection(item) ? (
                      <Accordion.Item
                        key={`section-${item.section}`}
                        value={item.section}
                      >
                        <SectionTrigger
                          description={item.description}
                          isOpen={openSections.includes(item.section)}
                          title={item.section}
                        />
                        <Accordion.Content className="pt-2 pb-4 pl-4">
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
                visibleParameters.map(item =>
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
            {hasHiddenParams ? (
              <div className="shrink-0">
                <FgSwitch
                  checked={showHidden}
                  id="show-hidden-toggle"
                  label="Show hidden"
                  onChange={() => {
                    if (!showHidden) {
                      // Expand sections that contain hidden parameters
                      const sectionsWithHidden = entryPoint.parameters
                        .filter(
                          item =>
                            isParameterSection(item) &&
                            item.parameters.some(p => p.hidden)
                        )
                        .map(item => (item as AppParameterSection).section);
                      setOpenSections(prev => [
                        ...new Set([...prev, ...sectionsWithHidden])
                      ]);
                    }
                    setShowHidden(prev => !prev);
                  }}
                />
              </div>
            ) : null}
          </div>
        </Tabs.Panel>

        <Tabs.Panel className="pt-4" value="environment">
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-2xl grow space-y-4">
              {(entryPoint.env_parameters ?? []).length > 0 ? (
                <Accordion
                  onValueChange={
                    setOpenEnvParamSections as Dispatch<
                      SetStateAction<string | string[]>
                    >
                  }
                  type="multiple"
                  value={openEnvParamSections}
                >
                  {(entryPoint.env_parameters ?? []).map(item =>
                    isParameterSection(item) ? (
                      <Accordion.Item
                        key={`env-section-${item.section}`}
                        value={item.section}
                      >
                        <SectionTrigger
                          description={item.description}
                          isOpen={openEnvParamSections.includes(item.section)}
                          title={item.section}
                        />
                        <Accordion.Content className="pt-2 pb-4 pl-4">
                          <SectionContent
                            errors={{}}
                            onParamChange={handleEnvChange}
                            section={item}
                            values={envValues}
                          />
                        </Accordion.Content>
                      </Accordion.Item>
                    ) : (
                      <ParameterFieldRow
                        error={undefined}
                        key={item.key}
                        onChange={val => handleEnvChange(item.key, val)}
                        param={item}
                        value={envValues[item.key]}
                      />
                    )
                  )}
                </Accordion>
              ) : null}

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
            </div>
          </div>
        </Tabs.Panel>

        <Tabs.Panel className="pt-4" value="cluster">
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-2xl grow space-y-4">
              <ClusterTabContent
                extraArgs={extraArgs}
                openClusterSections={openClusterSections}
                resources={resources}
                setExtraArgs={setExtraArgs}
                setOpenClusterSections={setOpenClusterSections}
                setResources={setResources}
              />
            </div>
          </div>
        </Tabs.Panel>
      </Tabs>

      {/* Errors (bottom) */}
      {validationErrorBanner}
      {submitErrorBanner}

      {/* Submit (bottom) */}
      <div className="flex justify-end mt-6">{actionButtons}</div>
    </div>
  );
}
