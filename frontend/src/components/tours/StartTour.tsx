import { Button } from '@material-tailwind/react';
import type { ButtonProps } from '@material-tailwind/react';
import { useNavigate } from 'react-router';
import { useShepherd } from 'react-shepherd';
import type { Tour } from 'shepherd.js';
import { tourSteps } from './tourSteps';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import type { Zone } from '@/shared.types';

// Helper to wait for an element to appear in the DOM
function waitForElement(selector: string, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  return new Promise<void>((resolve, reject) => {
    const tick = () => {
      if (document.querySelector(selector)) {
        return resolve();
      }
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Timeout waiting for ${selector}`));
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

interface StartTourProps extends ButtonProps {
  readonly children: React.ReactNode;
}

export default function StartTour({
  children,
  ...buttonProps
}: StartTourProps) {
  const navigate = useNavigate();
  const shepherd = useShepherd();
  const { zonesAndFspQuery } = useZoneAndFspMapContext();

  // Check if running on Janelia filesystem
  const isJaneliaFilesystem =
    zonesAndFspQuery.data &&
    Object.values(zonesAndFspQuery.data).some(
      item =>
        'mount_path' in item &&
        (item.mount_path.toLowerCase().includes('nrs') ||
          item.mount_path.toLowerCase().includes('prfs') ||
          item.mount_path.toLowerCase().includes('nearline'))
    );

  const tasksEnabled = import.meta.env.VITE_ENABLE_TASKS === 'true';

  // Helper to set up navigation sidebar step with conditional navigation
  const setupNavigationSidebarStep = (tour: Tour) => {
    const navSidebarStep = tour.getById('nav-sidebar');
    if (navSidebarStep) {
      navSidebarStep.updateStepOptions({
        buttons: [
          {
            text: 'Back',
            action: function (this: any) {
              return this.back();
            },
            classes: 'shepherd-button-secondary'
          },
          {
            text: 'Next',
            action: async function (this: any) {
              // Check if user has navigated from /browse
              if (window.location.pathname === '/browse') {
                // User hasn't navigated, force navigation to a file path
                if (isJaneliaFilesystem) {
                  navigate('/browse/nrs_opendata');
                } else {
                  const firstZone = Object.values(
                    zonesAndFspQuery.data || {}
                  ).find(item => 'fileSharePaths' in item) as Zone | undefined;
                  if (firstZone && firstZone.fileSharePaths.length > 0) {
                    const firstFsp = firstZone.fileSharePaths[0];
                    navigate(`/browse/${firstFsp.name}`);
                  }
                }
                await waitForElement('[data-tour="file-browser"]');
              }
              return this.next();
            }
          },
          {
            text: 'Exit Tour',
            action: function (this: any) {
              return this.cancel();
            },
            classes: 'shepherd-button-secondary'
          }
        ]
      });
    }
  };

  // Helper to set up conversion properties step with convert tab opened
  const setupConversionStartStep = (tour: Tour) => {
    const conversionStartStep = tour.getById('conversion-start');
    if (conversionStartStep) {
      conversionStartStep.updateStepOptions({
        buttons: [
          {
            text: 'Back',
            action: function (this: any) {
              return this.back();
            },
            classes: 'shepherd-button-secondary'
          },
          {
            text: 'Next',
            action: async function (this: any) {
              // Navigate with openConvertTab state to open properties with Convert tab selected
              const currentPath = window.location.pathname;
              navigate(currentPath, {
                state: { openConvertTab: true },
                replace: true
              });
              await waitForElement('[data-tour="open-conversion-request"]');
              return this.next();
            }
          },
          {
            text: 'Exit Tour',
            action: function (this: any) {
              return this.cancel();
            },
            classes: 'shepherd-button-secondary'
          }
        ]
      });
    }
  };

  // Helper to set up conversion properties step with convert tab opened
  const setupConversionPropertiesStep = (tour: Tour) => {
    const conversionPropertiesStep = tour.getById('conversion-properties');
    if (conversionPropertiesStep) {
      conversionPropertiesStep.updateStepOptions({
        buttons: [
          {
            text: 'Back',
            action: function (this: any) {
              return this.back();
            },
            classes: 'shepherd-button-secondary'
          },
          {
            text: 'Next',
            action: async function (this: any) {
              navigate('/jobs');
              await waitForElement('[data-tour="tasks-page"]');
              return this.next();
            }
          },
          {
            text: 'Exit Tour',
            action: function (this: any) {
              return this.cancel();
            },
            classes: 'shepherd-button-secondary'
          }
        ]
      });
    }
  };

  // Helper to set up completion buttons for tour ending steps
  const setupCompletionButtons = (tour: Tour) => {
    const completionStepIds = [
      'nav-properties',
      'datalinks-janelia-preferences',
      'datalinks-general-preferences',
      'conversion-jobs'
    ];

    completionStepIds.forEach(stepId => {
      const step = tour.getById(stepId);
      if (step) {
        // Get existing buttons to preserve the back button behavior
        const buttons = [
          {
            text: 'Back',
            action: function (this: any) {
              return this.back();
            },
            classes: 'shepherd-button-secondary'
          },
          {
            text: 'Take Another Tour',
            action: function (this: any) {
              const currentTour = shepherd.activeTour as Tour;
              // Re-setup workflow buttons to ensure they work when returning
              setupWorkflowButtons(currentTour);
              // Show the workflow selection step
              currentTour.show('choose-workflow');
            }
          },
          {
            text: 'Exit Tour',
            action: function (this: any) {
              return this.cancel();
            },
            classes: 'shepherd-button-secondary'
          }
        ];

        step.updateStepOptions({ buttons });
      }
    });
  };

  // Helper to set up workflow selection buttons
  const setupWorkflowButtons = (tour: Tour) => {
    const firstStep = tour.getById('choose-workflow');
    if (!firstStep) {
      return;
    }

    const workflowButtons: any[] = [
      {
        text: 'Navigation',
        action: async function (this: any) {
          const currentTour = shepherd.activeTour as Tour;
          navigate('/browse');
          await waitForElement('[data-tour="navigation-input"]');
          setupNavigationSidebarStep(currentTour);
          setupCompletionButtons(currentTour);
          currentTour.show('nav-navigation-input');
        }
      },
      {
        text: 'Data Links',
        action: async function (this: any) {
          const currentTour = shepherd.activeTour as Tour;
          if (isJaneliaFilesystem) {
            navigate(
              '/browse/nrs_opendata/ome-zarr-examples/fused-timeseries.zarr'
            );
            await waitForElement('[data-tour="file-browser"]');
            setupCompletionButtons(currentTour);
            currentTour.show('datalinks-janelia-start');
          } else {
            // Navigate to first FSP of first zone
            const firstZone = Object.values(zonesAndFspQuery.data || {}).find(
              item => 'fileSharePaths' in item
            ) as Zone | undefined;
            if (firstZone && firstZone.fileSharePaths.length > 0) {
              const firstFsp = firstZone.fileSharePaths[0];
              navigate(`/browse/${firstFsp.name}`);
              await waitForElement('[data-tour="file-browser"]');
              setupCompletionButtons(currentTour);
              currentTour.show('datalinks-general-start');
            }
          }
        }
      }
    ];

    // Only add File Conversion option if tasks are enabled
    if (tasksEnabled) {
      workflowButtons.push({
        text: 'File Conversion',
        action: async function (this: any) {
          const currentTour = shepherd.activeTour as Tour;
          if (isJaneliaFilesystem) {
            navigate(
              '/browse/nrs_opendata/ome-zarr-examples/fused-timeseries.zarr'
            );
          } else {
            const firstZone = Object.values(zonesAndFspQuery.data || {}).find(
              item => 'fileSharePaths' in item
            ) as Zone | undefined;
            if (firstZone && firstZone.fileSharePaths.length > 0) {
              const firstFsp = firstZone.fileSharePaths[0];
              navigate(`/browse/${firstFsp.name}`);
            }
          }
          await waitForElement('[data-tour="file-browser"]');
          setupConversionStartStep(currentTour);
          setupConversionPropertiesStep(currentTour);
          setupCompletionButtons(currentTour);
          currentTour.show('conversion-start');
        }
      });
    }

    workflowButtons.push({
      text: 'Exit',
      action: function (this: any) {
        const currentTour = shepherd.activeTour as Tour;
        currentTour.cancel();
      },
      classes: 'shepherd-button-secondary'
    });

    firstStep.updateStepOptions({ buttons: workflowButtons });
  };

  const handleStartTour = () => {
    // Get or create the tour instance
    let tour = shepherd.activeTour as Tour | undefined;
    if (!tour) {
      tour = new shepherd.Tour({
        useModalOverlay: true,
        defaultStepOptions: {
          classes: 'shepherd-theme-default',
          scrollTo: true,
          cancelIcon: {
            enabled: true
          }
        }
      });
      shepherd.activeTour = tour;
    }

    // Add steps if not already added
    if (!tour.steps || tour.steps.length === 0) {
      tour.addSteps(tourSteps);
    }

    // Set up workflow selection buttons (do this every time to ensure they work when returning)
    setupWorkflowButtons(tour);

    // Set up completion buttons with proper tour context
    setupCompletionButtons(tour);

    tour.start();
  };

  return (
    <Button color="primary" onClick={handleStartTour} {...buttonProps}>
      {children}
    </Button>
  );
}
