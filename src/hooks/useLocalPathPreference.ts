// import React from 'react';
// import { usePreferencesContext } from '../contexts/PreferencesContext';

// export default function useLocalPathPreference() {
//   const { pathPreference } = usePreferencesContext();

//   const [localPathPreference, setLocalPathPreference] = React.useState(
//     pathPreference || ['linux_path']
//   );

//   const handleLocalChange = (event: React.ChangeEvent<HTMLInputElement>) => {
//     if (
//       event.target.value === 'linux_path' ||
//       event.target.value === 'mac_path' ||
//       event.target.value === 'windows_path'
//     ) {
//       setLocalPathPreference([event.target.value]);
//     }
//   };

//   return {
//     localPathPreference,
//     handleLocalChange
//   };
// }
