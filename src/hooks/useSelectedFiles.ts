import React from 'react';
import type { File } from '../shared.types';

export default function useSelectedFiles() {
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);

  return {
    selectedFiles,
    setSelectedFiles
  };
}
