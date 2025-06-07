import log from 'loglevel';

const logger = log.getLogger('app');

// Set log level based on environment
if (process.env.NODE_ENV === 'production') {
  logger.setLevel('warn'); // suppress debug/info in production
} else {
  logger.setLevel('debug'); // verbose in dev
}

export default logger;