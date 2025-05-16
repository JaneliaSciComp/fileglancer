// import React from 'react';
// import {
//   getAPIPathRoot,
//   sendFetchRequest,
//   removeLastSegmentFromPath
// } from '../utils';
// import { useCookiesContext } from '../contexts/CookiesContext';
// import type { File } from '../shared.types';
// import { useZoneBrowserContext } from '../contexts/ZoneBrowserContext';
// import { useFileBrowserContext } from '../contexts/FileBrowserContext';

// export default function useDeleteDialog() {
//   const [showAlert, setShowAlert] = React.useState<boolean>(false);
//   const [alertContent, setAlertContent] = React.useState<string>('');
//   const { cookies } = useCookiesContext();
//   const { currentFileSharePath } = useZoneBrowserContext();
//   const { fetchAndFormatFilesForDisplay } = useFileBrowserContext();

//   async function handleDelete(targetItem: File) {
//     try {
//       console.log('Deleting item:', targetItem);
//       await sendFetchRequest(
//         `${getAPIPathRoot()}api/fileglancer/files/${currentFileSharePath?.name}?subpath=${targetItem.path}`,
//         'DELETE',
//         cookies['_xsrf']
//       );
//       await fetchAndFormatFilesForDisplay(
//         `${currentFileSharePath?.name}?subpath=${removeLastSegmentFromPath(targetItem.path)}`
//       );
//       setAlertContent(
//         `Successfully deleted ${currentFileSharePath?.name}/${targetItem.path}`
//       );
//     } catch (error) {
//       setAlertContent(
//         `Error deleting ${currentFileSharePath?.name}/${targetItem.path}: ${error instanceof Error ? error.message : 'Unknown error'}`
//       );
//     }
//     setShowAlert(true);
//   }

//   return { handleDelete, showAlert, setShowAlert, alertContent };
// }
