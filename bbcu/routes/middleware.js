/**
 © Copyright IBM Corp. 2019, 2019

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

// Logging setup
const Logger = require('../libs/logger.js').Logger;
const logger = Logger.makeLogger(Logger.logPrefix(__filename));

/**
 * Redirects a user to the login page unless they are logged in, meaning the `user_id` field is filled out in their
 * session (login endpoints should do this).
 * @param {object} req An express request object.  Holds the session.
 * @param {object} res An express response object.  Used to redirect users that aren't logged in.
 * @param {function} next The next handler in the express chain.  Generally, it's the endpoint that requires user authentication.
 * @returns {void}
 */
module.exports.user_authentication = function (req, res, next) {
	logger.debug(`User session: ${JSON.stringify(req.session)}`);
	if (req && req.session && req.session.user_id && typeof req.session.user_id === 'string') {
		logger.info(`User ${req.session.user_id} is logged in`);
		next();
	} else {
		logger.info('User is not logged in. Redirecting to /login');
		res.redirect('/login');
	}
};

/**
 * Only sessions with logged in users will get past this middle.
 * @param {object} req An express request object.  Holds the session.
 * @param {object} res An express response object.
 * @param {function} next The next handler in the express chain.  Generally, it's the endpoint that requires user authentication.
 * @returns {void}
 */
module.exports.is_logged_in = function (req, res, next) {
	logger.debug(`User session: ${JSON.stringify(req.session)}`);
	if (req && req.session && req.session.user_id && typeof req.session.user_id === 'string') {
		logger.info(`User ${req.session.user_id} is logged in`);
		next();
	} else {
		logger.info('User is not logged in.');
		res.status(401).json({
			error: 'NOT_AUTHORIZED',
			reason: 'You must be logged in to use this API endpoint'
		});
	}
};