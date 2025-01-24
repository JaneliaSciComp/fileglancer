import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { MainAreaWidget } from '@jupyterlab/apputils';
import { ILauncher } from '@jupyterlab/launcher';
import { reactIcon } from '@jupyterlab/ui-components';
import { AppWidget } from './App';

/**
 * The command IDs used by the react-widget plugin.
 */
namespace CommandIDs {
  export const createReactWidget = 'create-react-widget';
}

/**
 * Initialization data for the fileglancer-frontend-ext extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'fileglancer-frontend-ext:plugin',
  description: 'React-based frontend extension for the Fileglancer app.',
  autoStart: true,
  optional: [ILauncher],
  activate: (app: JupyterFrontEnd, launcher: ILauncher) => {
    console.log('JupyterLab extension fileglancer-frontend-ext is activated!');
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
      launcher.add({
        command
      });
    }
  }
};

export default plugin;
