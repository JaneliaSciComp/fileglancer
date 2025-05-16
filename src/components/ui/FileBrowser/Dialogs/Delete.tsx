// import React from 'react';
// import {
//   Alert,
//   Button,
//   Dialog,
//   IconButton,
//   Typography
// } from '@material-tailwind/react';
// import { XMarkIcon } from '@heroicons/react/24/outline';
// import useDeleteDialog from '../../../../hooks/useDeleteDialog';
// import type { File } from '../../../../shared.types';
// import { useZoneBrowserContext } from '../../../../contexts/ZoneBrowserContext';

// type DeleteDialogProps = {
//   targetItem: File;
//   showDeleteDialog: boolean;
//   setShowDeleteDialog: React.Dispatch<React.SetStateAction<boolean>>;
// };

// export default function DeleteDialog({
//   targetItem,
//   showDeleteDialog,
//   setShowDeleteDialog
// }: DeleteDialogProps): JSX.Element {
//   const { handleDelete, showAlert, setShowAlert, alertContent } =
//     useDeleteDialog();
//   const { currentFileSharePath } = useZoneBrowserContext();
//   return (
//     <Dialog open={showDeleteDialog}>
//       <Dialog.Overlay>
//         <Dialog.Content>
//           <IconButton
//             size="sm"
//             variant="outline"
//             color="secondary"
//             className="absolute right-2 top-2 text-secondary hover:text-background"
//             isCircular
//             onClick={() => {
//               setShowDeleteDialog(false);
//               setShowAlert(false);
//             }}
//           >
//             <XMarkIcon className="h-5 w-5" />
//           </IconButton>
//           <Typography className="my-8 text-large">
//             Are you sure you want to delete{' '}
//             <span className="font-semibold">
//               {currentFileSharePath?.name}/{targetItem.path}
//             </span>
//             ?
//           </Typography>
//           <Button
//             className="!rounded-md"
//             onClick={() => {
//               handleDelete(targetItem);
//             }}
//           >
//             Delete
//           </Button>
//           {showAlert === true ? (
//             <Alert
//               className={`flex items-center gap-6 mt-6 border-none ${alertContent.startsWith('Error') ? 'bg-error-light/90' : 'bg-secondary-light/70'}`}
//             >
//               <Alert.Content>{alertContent}</Alert.Content>
//               <XMarkIcon
//                 className="h-5 w-5 cursor-pointer"
//                 onClick={() => {
//                   setShowAlert(false);
//                   setShowDeleteDialog(false);
//                 }}
//               />
//             </Alert>
//           ) : null}
//         </Dialog.Content>
//       </Dialog.Overlay>
//     </Dialog>
//   );
// }
