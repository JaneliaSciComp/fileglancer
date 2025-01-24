import { ReactWidget } from '@jupyterlab/ui-components';

import React from 'react';
import { Toggle } from './components/Toggle';
import { FileList } from './components/FileList';

/**
 * React component for a counter.
 *
 * @returns The React component
 */
const AppComponent = (): JSX.Element => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        boxSizing: 'border-box'
      }}
    >
      <Toggle />
      <FileList />
    </div>
  );
};

/**
 * A Counter Lumino Widget that wraps a CounterComponent.
 */
export class AppWidget extends ReactWidget {
  /**
   * Constructs a new CounterWidget.
   */
  constructor() {
    super();
    this.addClass('jp-react-widget');
  }

  render(): JSX.Element {
    return <AppComponent />;
  }
}
