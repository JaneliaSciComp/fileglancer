# Integration Testing

This folder contains the UI integration tests for Fileglancer.

They are defined using [Playwright](https://playwright.dev/docs/intro) test runner.

The Playwright configuration is defined in [playwright.config.js](./playwright.config.js).

## Run the tests

> All commands are assumed to be executed from the root directory

To run the tests, you need to:

Install test dependencies (needed only once):

```bash
pixi run npx --prefix ui-tests playwright install
```

To execute the UI integration test, run:

```bash
pixi run test-ui
```

For more information, please refer to the [Development](../../docs/Development.md#integration-tests) documentation.
