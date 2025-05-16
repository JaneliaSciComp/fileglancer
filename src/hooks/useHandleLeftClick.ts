// import React from 'react';
// import type { File } from '../shared.types';

// // Hook to handle left click events on files in the file browser
// export default function useHandleLeftClick() {
//   const handleLeftClick = (
//     e: React.MouseEvent<HTMLDivElement>,
//     file: File,
//     selectedFiles: File[],
//     setSelectedFiles: React.Dispatch<React.SetStateAction<File[]>>,
//     displayFiles: File[],
//     setPropertiesTarget: React.Dispatch<React.SetStateAction<File | null>>,
//     showFilePropertiesDrawer: boolean
//   ) => {
//     if (e.shiftKey) {
//       // If shift key held down while clicking,
//       // add all files between the last selected and the current file
//       const lastSelectedIndex = selectedFiles.length
//         ? displayFiles.findIndex(
//             f => f === selectedFiles[selectedFiles.length - 1]
//           )
//         : -1;
//       const currentIndex = displayFiles.findIndex(f => f.name === file.name);
//       const start = Math.min(lastSelectedIndex, currentIndex);
//       const end = Math.max(lastSelectedIndex, currentIndex);
//       const newSelectedFiles = displayFiles.slice(start, end + 1);
//       setSelectedFiles(newSelectedFiles);
//       setPropertiesTarget(file);
//     } else if (e.metaKey) {
//       // If  "Windows/Cmd" is held down while clicking,
//       // toggle the current file in the selection
//       // and set it as the properties target
//       const currentIndex = selectedFiles.indexOf(file);
//       const newSelectedFiles = [...selectedFiles];

//       if (currentIndex === -1) {
//         newSelectedFiles.push(file);
//       } else {
//         newSelectedFiles.splice(currentIndex, 1);
//       }

//       setSelectedFiles(newSelectedFiles);
//       setPropertiesTarget(file);
//     } else {
//       // If no modifier keys are held down, select the current file
//       const currentIndex = selectedFiles.indexOf(file);
//       const newSelectedFiles =
//         currentIndex === -1 ||
//         selectedFiles.length > 1 ||
//         showFilePropertiesDrawer
//           ? [file]
//           : [];
//       setSelectedFiles(newSelectedFiles);
//       const newPropertiesTarget =
//         currentIndex === -1 ||
//         selectedFiles.length > 1 ||
//         showFilePropertiesDrawer
//           ? file
//           : null;
//       setPropertiesTarget(newPropertiesTarget);
//     }
//   };

//   return {
//     handleLeftClick
//   };
// }
