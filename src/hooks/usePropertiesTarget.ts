// import React from 'react';
// import type { File } from '../shared.types';
// import { useFileBrowserContext } from '../contexts/FileBrowserContext';
// import { useZoneBrowserContext } from '../contexts/ZoneBrowserContext';

// export default function usePropertiesTarget() {
//   const [propertiesTarget, setPropertiesTarget] = React.useState<File | null>(
//     null
//   );
//   const { currentFileSharePath, currentNavigationZone } =
//     useZoneBrowserContext();
//   const { files } = useFileBrowserContext();

//   React.useEffect(() => {
//     if (propertiesTarget) {
//       setPropertiesTarget(null);
//     }
//   }, [currentFileSharePath, currentNavigationZone]);

//   React.useEffect(() => {
//     if (propertiesTarget) {
//       const targetFile = files.find(
//         file => file.name === propertiesTarget.name
//       );
//       if (targetFile) {
//         setPropertiesTarget(targetFile);
//       } else if (!targetFile) {
//         setPropertiesTarget(null);
//       }
//     }
//   }, [files]);

//   return {
//     propertiesTarget,
//     setPropertiesTarget
//   };
// }
