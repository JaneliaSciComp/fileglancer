import log from 'loglevel';

const logger = log.getLogger('app');

// Set log level based on environment
if (process.env.NODE_ENV === 'production') {
  console.log('Setting log level to warn in production');
  logger.setLevel('warn'); // suppress debug/info in production
} else {
  console.log('Setting log level to debug in development');
  logger.setLevel('debug'); // verbose in dev
}

export default logger;
