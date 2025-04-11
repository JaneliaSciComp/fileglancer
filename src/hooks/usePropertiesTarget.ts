import React from 'react';
import type { File } from '../shared.types';

export default function usePropertiesTarget() {
  const [propertiesTarget, setPropertiesTarget] = React.useState<File | null>(
    null
  );
  return {
    propertiesTarget,
    setPropertiesTarget
  };
}
