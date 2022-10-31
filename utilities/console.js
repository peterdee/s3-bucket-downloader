import { Console } from 'node:console';

const logger = new Console(process.stdout, process.stderr);

export const { time, timeEnd } = logger;

export default logger.log;
