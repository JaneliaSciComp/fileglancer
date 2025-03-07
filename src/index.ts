import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { MainAreaWidget } from '@jupyterlab/apputils';
import { ILauncher } from '@jupyterlab/launcher';
import { reactIcon } from '@jupyterlab/ui-components';
import { requestAPI } from './handler';
import { AppWidget } from './App';

/**
 * The command IDs used by the react-widget plugin.
 */
namespace CommandIDs {
  export const createReactWidget = 'create-react-widget';
}

/**
 * Initialization data for the fileglancer extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'fileglancer:plugin',
  description: 'Browse, share, and publish files on the Janelia file system',
  autoStart: true,
  optional: [ILauncher],
  activate: (app: JupyterFrontEnd, launcher: ILauncher) => {
    console.log('JupyterLab extension fileglancer is activated!');

    const { commands } = app;
    const command = CommandIDs.createReactWidget;

    commands.addCommand(command, {
      label: 'React Widget',
      icon: reactIcon,
      execute: () => {
        console.log('Create React widget command executed');
        const content = new AppWidget();
        const widget = new MainAreaWidget<AppWidget>({ content });
        widget.title.label = 'React Widget';
        widget.title.icon = reactIcon;
        app.shell.add(widget, 'main');
      }
    });

    if (launcher) {
      console.log('Adding command to launcher');
      launcher.add({ command });
    }

    requestAPI<any>('file-share-paths')
      .then(data => {
        console.log('File share paths:');
        console.log(data);
      })
      .catch(reason => {
        console.error(
          `Problem calling file-share-paths API:\n${reason}`
        );
      });
      
    requestAPI<any>('files/local')
      .then(data => {
        console.log('File listing /local:');
        console.log(data);
      })
      .catch(reason => {
        console.error(
          `Problem getting file listing:\n${reason}`
        );
      });

    requestAPI<any>('files/local?subpath=src')
      .then(data => {
        console.log('File listing /local/src:');
        console.log(data);
      })
      .catch(reason => {
        console.error(
          `Problem getting file listing:\n${reason}`
        );
      });
  }
};

export default plugin;
