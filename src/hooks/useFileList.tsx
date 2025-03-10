import * as React from 'react';

export type Content = {
  content: string | Content[] | null;
  created: string;
  format: null | 'text' | 'base64' | 'json';
  hash?: string;
  hash_algorithm?: string;
  last_modified: string;
  mimetype: string | null;
  name: string;
  path: string;
  size: number;
  type: string;
  writable: boolean;
};

export default function useFileList() {
  const [checked, setChecked] = React.useState<string[]>([]);
  const [content, setContent] = React.useState<Content[]>([]);
  const [currentPath, setCurrentPath] = React.useState<string>('');

  const handleCheckboxToggle = (item: Content) => {
    const currentIndex = checked.indexOf(item.name);
    const newChecked = [...checked];

    if (currentIndex === -1) {
      newChecked.push(item.name);
    } else {
      newChecked.splice(currentIndex, 1);
    }

    setChecked(newChecked);
  };

  async function getContents(path?: Content['path']): Promise<void> {
    let url = '/api/contents?content=1';

    // Only append the path if it exists and is not empty
    if (path && path.trim() !== '') {
      url = `/api/contents/${path}?content=1`;
    }

    let data = [];
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Response status: ${response.status}`);
      }

      data = await response.json();
      if (data) {
        setCurrentPath(data.path);
      }
      if (data.content) {
        // display directories first, then files
        // within a type (directories or files), display alphabetically
        data.content = data.content.sort((a: Content, b: Content) => {
          if (a.type === b.type) {
            return a.name.localeCompare(b.name);
          }
          return a.type === 'directory' ? -1 : 1;
        });
        setContent(data.content as Content[]);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error.message);
      } else {
        console.error('An unknown error occurred');
      }
    }
  }

  return {
    checked,
    content,
    currentPath,
    handleCheckboxToggle,
    getContents
  };
}
