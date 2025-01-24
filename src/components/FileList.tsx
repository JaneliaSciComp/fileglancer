import * as React from 'react';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Checkbox from '@mui/material/Checkbox';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import FolderIcon from '@mui/icons-material/Folder';

import useFileList from '../hooks/useFileList';

export const FileList = (): JSX.Element => {
  const { checked, content, handleToggle, getContents } = useFileList();

  React.useEffect(() => {
    if (content.length === 0) {
      getContents();
    }
  }, [getContents]);
  console.log('content:', content);

  return (
    <>
      <List
        sx={{ width: '100%', maxWidth: 360, bgcolor: 'background.paper' }}
        dense
      >
        {content.length > 0 &&
          content.map(item => {
            const labelId = `checkbox-list-label-${item.name}`;

            return (
              <ListItem key={item.name} disablePadding disableGutters>
                <ListItemButton
                  role={undefined}
                  onClick={handleToggle(item.name)}
                  dense
                >
                  <ListItemIcon>
                    <Checkbox
                      edge="start"
                      checked={checked.includes(item.name)}
                      tabIndex={-1}
                      disableRipple
                      inputProps={{ 'aria-labelledby': labelId }}
                    />
                  </ListItemIcon>
                  <ListItemIcon>
                    {item.type === 'directory' ? (
                      <FolderIcon />
                    ) : (
                      <InsertDriveFileOutlinedIcon />
                    )}
                  </ListItemIcon>
                  <ListItemText id={labelId} primary={`${item.name}`} />
                </ListItemButton>
              </ListItem>
            );
          })}
      </List>
    </>
  );
};
