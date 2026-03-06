import { useState } from 'react';
import { Tabs } from '@material-tailwind/react';

import N5ViewerTab from '@/components/ui/Dialogs/dataLinkUsage/tabsContent/N5ViewerTab';
import JavaTab from '@/components/ui/Dialogs/dataLinkUsage/tabsContent/javaTab/JavaTab';
import NapariTab from '@/components/ui/Dialogs/dataLinkUsage/tabsContent/NapariTab';
import PythonTab from '@/components/ui/Dialogs/dataLinkUsage/tabsContent/PythonTab';
import VvdViewerTab from '@/components/ui/Dialogs/dataLinkUsage/tabsContent/VvdViewerTab';

import type {
  DataLinkType,
  ZarrVersion
} from '@/components/ui/Dialogs/dataLinkUsage/DataLinkUsageDialog';

function getTabsForDataType(
  dataType: DataLinkType,
  dataLinkUrl: string,
  tooltipTriggerClasses: string,
  zarrVersion?: ZarrVersion
) {
  if (dataType === 'directory') {
    return [
      {
        id: 'java',
        label: 'Java',
        content: (
          <JavaTab
            dataLinkUrl={dataLinkUrl}
            dataType={dataType}
            tooltipTriggerClasses={tooltipTriggerClasses}
            zarrVersion={zarrVersion}
          />
        )
      },
      {
        id: 'python',
        label: 'Python',
        content: (
          <PythonTab
            dataLinkUrl={dataLinkUrl}
            dataType={dataType}
            tooltipTriggerClasses={tooltipTriggerClasses}
          />
        )
      }
    ];
  }

  if (dataType === 'ome-zarr') {
    return [
      {
        id: 'java',
        label: 'Java',
        content: (
          <JavaTab
            dataLinkUrl={dataLinkUrl}
            dataType={dataType}
            tooltipTriggerClasses={tooltipTriggerClasses}
            zarrVersion={zarrVersion}
          />
        )
      },
      ...(zarrVersion !== 3
        ? [{ id: 'n5Viewer', label: 'N5 Viewer', content: <N5ViewerTab /> }]
        : []),
      {
        id: 'napari',
        label: 'Napari',
        content: (
          <NapariTab
            dataLinkUrl={dataLinkUrl}
            tooltipTriggerClasses={tooltipTriggerClasses}
          />
        )
      },

      {
        id: 'python',
        label: 'Python',
        content: (
          <PythonTab
            dataLinkUrl={dataLinkUrl}
            dataType={dataType}
            tooltipTriggerClasses={tooltipTriggerClasses}
            zarrVersion={zarrVersion}
          />
        )
      },
      ...(zarrVersion !== 3
        ? [{ id: 'vvdviewer', label: 'VVDViewer', content: <VvdViewerTab /> }]
        : [])
    ];
  }

  if (dataType === 'zarr') {
    return [
      {
        id: 'java',
        label: 'Java',
        content: (
          <JavaTab
            dataLinkUrl={dataLinkUrl}
            dataType={dataType}
            tooltipTriggerClasses={tooltipTriggerClasses}
            zarrVersion={zarrVersion}
          />
        )
      },
      ...(zarrVersion !== 3
        ? [{ id: 'n5Viewer', label: 'N5 Viewer', content: <N5ViewerTab /> }]
        : []),
      {
        id: 'python',
        label: 'Python',
        content: (
          <PythonTab
            dataLinkUrl={dataLinkUrl}
            dataType={dataType}
            tooltipTriggerClasses={tooltipTriggerClasses}
          />
        )
      }
    ];
  }

  // dataType === 'n5'
  return [
    {
      id: 'java',
      label: 'Java',
      content: (
        <JavaTab
          dataLinkUrl={dataLinkUrl}
          dataType={dataType}
          tooltipTriggerClasses={tooltipTriggerClasses}
          zarrVersion={zarrVersion}
        />
      )
    },
    { id: 'n5Viewer', label: 'N5 Viewer', content: <N5ViewerTab /> },
    {
      id: 'python',
      label: 'Python',
      content: (
        <PythonTab
          dataLinkUrl={dataLinkUrl}
          dataType={dataType}
          tooltipTriggerClasses={tooltipTriggerClasses}
        />
      )
    }
  ];
}

export default function DataLinkTabs({
  dataLinkUrl,
  dataType,
  tooltipTriggerClasses,
  zarrVersion
}: {
  readonly dataLinkUrl: string;
  readonly dataType: DataLinkType;
  readonly tooltipTriggerClasses: string;
  readonly zarrVersion?: ZarrVersion;
}) {
  const tabs = getTabsForDataType(
    dataType,
    dataLinkUrl,
    tooltipTriggerClasses,
    zarrVersion
  );
  const [activeTab, setActiveTab] = useState<string>(tabs[0]?.id ?? '');

  const TAB_TRIGGER_CLASSES = '!text-foreground h-full text-base';
  const PANEL_CLASSES =
    'flex flex-col gap-4 max-w-full h-[50vh] p-4 rounded-b-lg border border-t-0 border-surface dark:border-foreground/30 bg-surface-light dark:bg-surface overflow-y-auto overflow-x-hidden';

  return (
    <Tabs
      className="flex flex-col flex-1 min-h-0 gap-0 max-h-[75vh] w-[95%] self-center"
      onValueChange={setActiveTab}
      value={activeTab}
    >
      <Tabs.List className="justify-start items-stretch shrink-0 min-w-fit w-full py-2 rounded-b-none bg-surface dark:bg-surface-light">
        {tabs.map(tab => (
          <Tabs.Trigger
            className={TAB_TRIGGER_CLASSES}
            key={tab.id}
            value={tab.id}
          >
            {tab.label}
          </Tabs.Trigger>
        ))}
        <Tabs.TriggerIndicator className="h-full" />
      </Tabs.List>

      {tabs.map(tab => (
        <Tabs.Panel className={PANEL_CLASSES} key={tab.id} value={tab.id}>
          {tab.content}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
