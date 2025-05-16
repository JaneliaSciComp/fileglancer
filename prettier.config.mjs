/**
 * @see https://prettier.io/docs/configuration
 * @type {import("prettier").Config}
 */

const config = {
  singleQuote: true,
  trailingComma: 'none',
  arrowParens: 'avoid',
  endOfLine: 'auto',
  overrides: [
    {
      files: 'package.json',
      options: {
        tabWidth: 4
      }
    }
  ]
};

export default config;
