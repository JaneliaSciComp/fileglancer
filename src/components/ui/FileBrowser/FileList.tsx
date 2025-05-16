// import * as React from 'react';
// import { Typography } from '@material-tailwind/react';

// import type { File } from '../../../shared.types';
// import FileListCrumbs from './Crumbs';
// import FileRow from './FileRow';

// type FileListProps = {
//   displayFiles: File[];
//   selectedFiles: File[];
//   setSelectedFiles: React.Dispatch<React.SetStateAction<File[]>>;
//   showPropertiesDrawer: boolean;
//   setPropertiesTarget: React.Dispatch<React.SetStateAction<File | null>>;
//   handleRightClick: (
//     e: React.MouseEvent<HTMLDivElement>,
//     file: File,
//     selectedFiles: File[],
//     setSelectedFiles: React.Dispatch<React.SetStateAction<File[]>>,
//     setPropertiesTarget: React.Dispatch<React.SetStateAction<File | null>>
//   ) => void;
// };

// export default function FileList({
//   displayFiles,
//   selectedFiles,
//   setSelectedFiles,
//   showPropertiesDrawer,
//   setPropertiesTarget,
//   handleRightClick
// }: FileListProps): JSX.Element {
//   return (
//     <div
//       className={`px-2 transition-all duration-300 ${showPropertiesDrawer ? 'mr-[350px]' : ''}`}
//     >
//       <FileListCrumbs />
//       <div className="min-w-full bg-background select-none">
//         {/* Header row */}
//         <div className="min-w-fit grid grid-cols-[minmax(170px,2fr)_minmax(80px,1fr)_minmax(95px,1fr)_minmax(75px,1fr)_minmax(40px,1fr)] gap-4 p-0 text-foreground">
//           <div className="flex w-full gap-3 px-3 py-1 overflow-x-auto">
//             <Typography variant="small" className="font-bold">
//               Name
//             </Typography>
//           </div>

//           <Typography variant="small" className="font-bold overflow-x-auto">
//             Type
//           </Typography>

//           <Typography variant="small" className="font-bold overflow-x-auto">
//             Last Modified
//           </Typography>

//           <Typography variant="small" className="font-bold overflow-x-auto">
//             Size
//           </Typography>

//           <Typography variant="small" className="font-bold overflow-x-auto">
//             Actions
//           </Typography>
//         </div>

//         {/* File rows */}
//         {displayFiles.length > 0 &&
//           displayFiles.map((file, index) => {
//             return (
//               <FileRow
//                 key={file.name}
//                 file={file}
//                 index={index}
//                 selectedFiles={selectedFiles}
//                 setSelectedFiles={setSelectedFiles}
//                 displayFiles={displayFiles}
//                 showPropertiesDrawer={showPropertiesDrawer}
//                 setPropertiesTarget={setPropertiesTarget}
//                 handleRightClick={handleRightClick}
//               />
//             );
//           })}
//       </div>
//     </div>
//   );
// }
