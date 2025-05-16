// import * as React from 'react';
// import {
//   Alert,
//   Button,
//   IconButton,
//   Typography,
//   Tabs
// } from '@material-tailwind/react';
// import {
//   DocumentIcon,
//   FolderIcon,
//   Square2StackIcon,
//   XMarkIcon
// } from '@heroicons/react/24/outline';

// import type { File } from '../../../shared.types';
// import PermissionsTable from './PermissionsTable';
// import OverviewTable from './OverviewTable';
// import useCopyPath from '../../../hooks/useCopyPath';
// import { useZoneBrowserContext } from '../../../contexts/ZoneBrowserContext';

// type PropertiesDrawerProps = {
//   propertiesTarget: File | null;
//   open: boolean;
//   setShowPropertiesDrawer: React.Dispatch<React.SetStateAction<boolean>>;
//   setShowPermissionsDialog: React.Dispatch<React.SetStateAction<boolean>>;
// };

// export default function PropertiesDrawer({
//   propertiesTarget,
//   open,
//   setShowPropertiesDrawer,
//   setShowPermissionsDialog
// }: PropertiesDrawerProps): JSX.Element {
//   const {
//     copiedText,
//     showCopyAlert,
//     setShowCopyAlert,
//     copyToClipboard,
//     dismissCopyAlert
//   } = useCopyPath();
//   const { currentFileSharePath } = useZoneBrowserContext();

//   const fullPath = `${currentFileSharePath?.name}/${propertiesTarget?.path}`;

//   return (
//     <div
//       className={`fixed top-[68px] right-0 bottom-0 w-[90%] max-w-[350px] bg-background shadow-lg border-l border-surface shadow-surface transform transition-transform duration-300 ease-in-out ${open ? 'translate-x-0 z-50' : 'translate-x-full'}`}
//     >
//       <div className="flex flex-col h-full overflow-y-auto p-4">
//         <div className="flex items-center justify-between gap-4 mb-1">
//           <Typography type="h6">Properties</Typography>
//           <IconButton
//             size="sm"
//             variant="ghost"
//             color="secondary"
//             className="h-8 w-8 rounded-full text-foreground hover:bg-secondary-light/20"
//             onClick={() => {
//               if (open === true) {
//                 setShowCopyAlert(false);
//               }
//               setShowPropertiesDrawer((prev: boolean) => !prev);
//             }}
//           >
//             <XMarkIcon className="h-5 w-5" />
//           </IconButton>
//         </div>

//         {propertiesTarget ? (
//           <div className="flex items-center gap-2 mt-3 mb-4 max-h-min">
//             {propertiesTarget.is_dir ? (
//               <FolderIcon className="h-5 w-5" />
//             ) : (
//               <DocumentIcon className="h-5 w-5" />
//             )}{' '}
//             <Typography className="font-semibold">
//               {propertiesTarget?.name}
//             </Typography>
//           </div>
//         ) : (
//           <Typography className="mt-3 mb-4">
//             Click on a file or folder to view its properties
//           </Typography>
//         )}
//         {propertiesTarget ? (
//           <Tabs key="file-properties-tabs" defaultValue="overview">
//             <Tabs.List className="w-full rounded-none border-b border-secondary-dark  bg-transparent dark:bg-transparent py-0">
//               <Tabs.Trigger
//                 className="w-full !text-foreground"
//                 value="overview"
//               >
//                 Overview
//               </Tabs.Trigger>

//               <Tabs.Trigger
//                 className="w-full !text-foreground"
//                 value="permissions"
//               >
//                 Permissions
//               </Tabs.Trigger>

//               <Tabs.Trigger className="w-full !text-foreground" value="convert">
//                 Convert
//               </Tabs.Trigger>
//               <Tabs.TriggerIndicator className="rounded-none border-b-2 border-secondary bg-transparent dark:bg-transparent shadow-none" />
//             </Tabs.List>

//             <Tabs.Panel value="overview">
//               <div className="group flex justify-between items-center">
//                 <Typography className="text-foreground font-medium text-sm">
//                   <span className="!font-bold">Path: </span>
//                   {fullPath}
//                 </Typography>
//                 <IconButton
//                   variant="ghost"
//                   isCircular
//                   className="text-transparent group-hover:text-foreground"
//                   onClick={() => {
//                     if (propertiesTarget) {
//                       copyToClipboard(fullPath);
//                     }
//                   }}
//                 >
//                   <Square2StackIcon className="h-4 w-4" />
//                 </IconButton>
//               </div>
//               {copiedText.value === fullPath &&
//               copiedText.isCopied === true &&
//               showCopyAlert === true ? (
//                 <Alert className="flex items-center justify-between bg-secondary-light/70 border-none">
//                   <Alert.Content>Path copied to clipboard!</Alert.Content>
//                   <XMarkIcon
//                     className="h-5 w-5 cursor-pointer"
//                     onClick={dismissCopyAlert}
//                   />
//                 </Alert>
//               ) : null}
//               <OverviewTable file={propertiesTarget} />
//             </Tabs.Panel>

//             <Tabs.Panel value="permissions" className="flex flex-col gap-2">
//               <PermissionsTable file={propertiesTarget} />
//               <Button
//                 variant="outline"
//                 onClick={() => {
//                   setShowPermissionsDialog(true);
//                 }}
//                 className="!rounded-md"
//               >
//                 Change Permissions
//               </Button>
//             </Tabs.Panel>

//             <Tabs.Panel value="convert" className="flex flex-col gap-2">
//               <Typography variant="small" className="font-medium">
//                 Convert data to OME-Zarr
//               </Typography>
//               <Button as="a" href="#" variant="outline">
//                 Submit
//               </Button>
//             </Tabs.Panel>
//           </Tabs>
//         ) : null}
//       </div>
//     </div>
//   );
// }
