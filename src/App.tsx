import { ReactWidget } from '@jupyterlab/ui-components';
import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import Home from './Home';

/**
 * React component for a counter.
 *
 * @returns The React component
 */
const AppComponent = (): JSX.Element => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="lab/*" element={<Home />} />
      </Routes>
    </BrowserRouter>
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
