import type { StepOptions } from 'shepherd.js';

// Helper to create common button configs
const nextButton = {
  text: 'Next',
  action: function (this: any) {
    return this.next();
  }
};

const backButton = {
  text: 'Back',
  action: function (this: any) {
    return this.back();
  },
  classes: 'shepherd-button-secondary'
};

const exitButton = {
  text: 'Exit Tour',
  action: function (this: any) {
    return this.cancel();
  },
  classes: 'shepherd-button-secondary'
};

// Note: This will be replaced dynamically in StartTour.tsx to have proper tour context
const takeAnotherTourButton = {
  text: 'Take Another Tour',
  action: function (this: any) {
    // This is a placeholder - will be replaced in setupCompletionButtons
    console.warn('takeAnotherTourButton action not properly initialized');
  }
};

export const tourSteps: StepOptions[] = [
  {
    id: 'choose-workflow',
    title: 'Welcome to Fileglancer!',
    text: 'Which workflow would you like to explore?',
    buttons: [] // Will be dynamically replaced with branching buttons
  },

  // Navigation workflow steps
  {
    id: 'nav-navigation-input',
    title: 'Navigation',
    text: 'Use this navigation bar to quickly jump to any path in the file system. You can type or paste a path here.',
    attachTo: { element: '[data-tour="navigation-input"]', on: 'bottom' },
    buttons: [backButton, nextButton, exitButton]
  },
  {
    id: 'nav-sidebar',
    title: 'Sidebar',
    text: 'The sidebar shows your zones, file share paths, and favorite folders. Click on any item to navigate to it.',
    attachTo: { element: '[data-tour="sidebar"]', on: 'right' },
    buttons: [] // Will be dynamically replaced with navigation logic
  },
  {
    id: 'nav-file-browser',
    title: 'File Browser',
    text: 'Browse files and folders here. You can sort by column headers and select items to perform actions.',
    attachTo: { element: '[data-tour="file-browser"]', on: 'top' },
    buttons: [backButton, nextButton, exitButton]
  },
  {
    id: 'nav-properties',
    title: 'Properties Panel',
    text: 'View file metadata and perform actions like changing file permissions, creating shareable data links, or requesting file conversions.',
    attachTo: { element: '[data-tour="properties-drawer"]', on: 'left' },
    buttons: [backButton, takeAnotherTourButton, exitButton]
  },

  // Data Links workflow - Janelia filesystem
  {
    id: 'datalinks-janelia-start',
    title: 'Data Links',
    text: "Navigate to a Zarr file to create a data link you can use to open files in external viewers like Neuroglancer. Let's go to an example Zarr dataset.",
    attachTo: { element: '[data-tour="zarr-metadata"]', on: 'bottom' },
    buttons: [backButton, nextButton, exitButton]
  },
  {
    id: 'datalinks-janelia-properties',
    title: 'Creating Data Links',
    text: 'You can create a data link from the properties panel using the data link toggle. Turn it on to create a shareable link.',
    attachTo: { element: '[data-tour="properties-drawer"]', on: 'left' },
    buttons: [backButton, nextButton, exitButton]
  },
  {
    id: 'datalinks-janelia-viewer',
    title: 'Viewer Links',
    text: 'Click on viewer icons in the metadata section to open the Zarr file in external viewers like Neuroglancer.',
    attachTo: { element: '[data-tour="data-tool-links"]', on: 'bottom' },
    buttons: [backButton, nextButton, exitButton]
  },
  {
    id: 'datalinks-janelia-preferences',
    title: 'Automatic Data Links',
    text: 'You can enable automatic data link creation on the Preferences page, accessible from the profile menu.',
    attachTo: { element: '[data-tour="profile-menu"]', on: 'bottom' },
    buttons: [backButton, takeAnotherTourButton, exitButton]
  },

  // Data Links workflow - Non-Janelia filesystem
  {
    id: 'datalinks-general-start',
    title: 'Data Links',
    text: 'You can create data links for any directory. Navigate to a folder you want to share.',
    attachTo: { element: '[data-tour="file-browser"]', on: 'top' },
    buttons: [backButton, nextButton, exitButton]
  },
  {
    id: 'datalinks-general-properties',
    title: 'Creating Data Links',
    text: 'Open the properties panel and toggle the data link option to create a shareable link for this directory.',
    attachTo: { element: '[data-tour="properties-drawer"]', on: 'left' },
    buttons: [backButton, nextButton, exitButton]
  },
  {
    id: 'datalinks-general-zarr',
    title: 'Zarr/N5 Files',
    text: "If a file is detected as Zarr or N5, you'll see viewer icons in the metadata displayed at the top of the file browser. You can click on a viewer icon to open the data link in external viewers like Neuroglancer.",
    buttons: [backButton, nextButton, exitButton]
  },
  {
    id: 'datalinks-general-preferences',
    title: 'Automatic Data Links',
    text: 'You can enable automatic data link creation on the Preferences page, accessible from the profile menu.',
    attachTo: { element: '[data-tour="profile-menu"]', on: 'bottom' },
    buttons: [backButton, takeAnotherTourButton, exitButton]
  },

  // File Conversion workflow
  {
    id: 'conversion-start',
    title: 'File Conversion',
    text: "Navigate to a file you want to convert. Let's go to an example file.",
    buttons: [] // Will be dynamically replaced with navigation logic
  },
  {
    id: 'conversion-properties',
    title: 'Request Conversion',
    text: 'Select a file and open the properties panel to the "Convert" tab. Click "Open conversion request" to submit a conversion task.',
    attachTo: { element: '[data-tour="properties-drawer"]', on: 'left' },
    buttons: [] // Will be dynamically replaced with navigation logic
  },
  {
    id: 'conversion-jobs',
    title: 'Monitor Tasks',
    text: 'View the status of your conversion requests on the Tasks page.',
    attachTo: { element: '[data-tour="tasks-page"]', on: 'bottom' },
    buttons: [backButton, takeAnotherTourButton, exitButton]
  }
];
