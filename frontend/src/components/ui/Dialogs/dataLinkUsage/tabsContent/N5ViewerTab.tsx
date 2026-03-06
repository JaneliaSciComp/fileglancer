import InstructionBlock from '@/components/ui/Dialogs/dataLinkUsage/InstructionBlock';
import PrerequisitesBlock from '@/components/ui/Dialogs/dataLinkUsage/PrerequisitesBlock';

export default function N5ViewerTab() {
  return (
    <>
      <PrerequisitesBlock
        prerequisites={[
          { label: 'Fiji', href: 'https://imagej.net/software/fiji/downloads' }
        ]}
      />
      <InstructionBlock
        steps={[
          'Launch Fiji',
          'Navigate to Plugins \u2192 BigDataViewer \u2192 HDF5/N5/Zarr/OME-NGFF Viewer',
          'Paste your data link into the text input area located at the top of the "Main" tab of the resulting dialog. Then click "Detect datasets"',
          'In the text area under where you pasted the data link, you should now see the image file name, followed by "multiscale". Click on this entry, then click "OK"'
        ]}
      />
    </>
  );
}
