/**
 © Copyright IBM Corp. 2019

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

const assert = require('assert');
const path = require('path');

const {createLogger, format, transports} = require('winston');
const {combine, timestamp, label, printf} = format;

let log_level = 'debug';

/**
 * Logger contains helper functions for creating winston loggers with custom labeling.  Other modules should require
 * Logger in order to tag the log output, making logs easier to parse for developers and SREs.
 * @type {module.Logger}
 */
exports.Logger = class Logger {

	/**
	 * Gets the winston log level that is being used to create new loggers
	 *
	 * @returns {string} A winston logging level
	 */
	static getLogLevel () {
		return log_level;
	}

	/**
	 * Sets the global logging level for all future loggers.
	 *
	 * @param {string} level A valid winston logging level
	 * @returns {void}
	 */
	static setLogLevel (level) {
		assert(level && typeof level === 'string');
		const log_levels = [ 'error', 'warn', 'info', 'verbose', 'debug', 'silly' ];
		const index = log_levels.indexOf(level.trim().toLowerCase());
		assert(index >= 0);
		log_level = log_levels[index];
	}

	/**
	 * Creates/gets a winston logger that will prepend the given prefix to whatever log messages it produces.
	 *
	 * @param {string} tag The prefix for log messages.  Appears as "info: [tag] this is a log message"
	 * @returns {*} A winston logger
	 */
	static makeLogger (tag) {
		assert(tag && typeof tag === 'string');

		const myFormat = printf(info => {
			return `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`;
		});

		const logger = createLogger({
			format: combine(
				label({label: tag}),
				timestamp(),
				myFormat
			),
			transports: [ new transports.Console() ],
			level: log_level
		});
		return logger;
	}

	/**
	 * Creates a log prefix for modules.  The prefix will be the relative path from the root of the project to the
	 * module file.
	 *
	 * @param {string} filename The __filename of a module
	 * @returns {string} A logging prefix of the form 'dir1/dir2/module.js'
	 */
	static logPrefix (filename) {
		return path.join(path.relative(path.join(__dirname, '..'), path.dirname(filename)), path.basename(filename)).toString();
	}
};
