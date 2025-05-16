import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ILauncher } from '@jupyterlab/launcher';
import { LabIcon } from '@jupyterlab/ui-components';

/**
 * Custom icon
 */

const FileglancerIcon = new LabIcon({
  name: 'fileglancer',
  svgstr:
    '<svg width="6.35mm" height="8.4667mm" version="1.1" viewBox="0 0 6.35 8.4667" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"> <defs> <linearGradient id="linearGradient56" x1="161.81" x2="167.31" y1="133.09" y2="136.26" gradientUnits="userSpaceOnUse"> <stop stop-color="#058d96" offset="0"/> <stop stop-color="#6d28d9" offset="1"/> </linearGradient> </defs> <g transform="translate(-161.38 -130.44)"> <g fill="url(#linearGradient56)" fill-rule="evenodd"> <path d="m167.2 137.85v-4.2333h-1.8521c-0.43821 0-0.79375-0.35553-0.79375-0.79375v-1.8521h-2.1167c-0.2927 0-0.52918 0.23648-0.52918 0.52917v6.35c0 0.2927 0.23648 0.52916 0.52918 0.52916h4.2333c0.29269 0 0.52916-0.23646 0.52916-0.52916zm-8e-3 -4.7625c-0.012-0.0463-0.0347-0.0893-0.0695-0.1224l-1.9166-1.9166c-0.0347-0.0347-0.076-0.0579-0.1224-0.0695v1.8438c0 0.14552 0.11907 0.26459 0.26459 0.26459zm-5.8126-1.5875c0-0.58373 0.4746-1.0583 1.0583-1.0583h2.5814c0.21001 0 0.41175 0.0844 0.56059 0.23316l1.9166 1.9149c0.14883 0.14883 0.23316 0.35057 0.23316 0.56059v4.6997c0 0.58374-0.4746 1.0583-1.0583 1.0583h-4.2333c-0.58373 0-1.0583-0.4746-1.0583-1.0583z" stroke-width=".016536"/> <path d="m164.59 136.28c0.36648 0 0.66354-0.29706 0.66354-0.66354 0-0.36647-0.29706-0.66354-0.66354-0.66354-0.36647 0-0.66354 0.29707-0.66354 0.66354 0 0.36648 0.29707 0.66354 0.66354 0.66354z" stroke-width=".22118"/> <path d="m162.22 135.49c0.32895-0.9889 1.2617-1.7024 2.3615-1.7024 1.0993 0 2.0317 0.71279 2.3611 1.701 0.0266 0.0798 0.0266 0.16625 1e-4 0.24612-0.32897 0.98889-1.2617 1.7023-2.3616 1.7023-1.0993 0-2.0317-0.71278-2.3611-1.701-0.0265-0.0798-0.0266-0.16625-7e-5 -0.24611zm3.5226 0.12237c0 0.64131-0.51988 1.1612-1.1612 1.1612s-1.1612-0.51987-1.1612-1.1612 0.51988-1.1612 1.1612-1.1612 1.1612 0.51987 1.1612 1.1612z" clip-rule="evenodd" stroke-width=".22118"/> </g> </g> </svg>'
});

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
      label: 'Fileglancer',
      icon: FileglancerIcon,
      execute: () => {
        console.log('Create React widget command executed');
        window.location.href = '/fg/';
      }
    });

    if (launcher) {
      console.log('Adding command to launcher');
      launcher.add({ command });
    }

    if (navigator.webdriver) {
      console.log('Running in test mode, skipping demos.');
      return;
    }
  }
};

export default plugin;
