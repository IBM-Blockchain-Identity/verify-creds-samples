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

// Logging setup
const Logger = require('../libs/logger.js').Logger;
const logger = Logger.makeLogger(Logger.logPrefix(__filename));

/**
 * Captures all the middleware functions needed to secure the APIs for the app.
 */
class Middleware {

	/**
	 * Creates a middleware provider with the given authentication credentials.
	 * @param {string} admin_user The admin username.
	 * @param {string} admin_password The admin password.
	 * @param {string} realm The basic auth login realm.
	 */
	constructor (admin_user, admin_password, realm) {
		this.admin_user = admin_user;
		this.admin_password = admin_password;
		this.realm = realm;

		// Bind function contexts so the functions will have access to `this`
		this.is_admin = this.is_admin.bind(this);
		this.is_admin_or_user = this.is_admin_or_user.bind(this);
	}

	/**
	 * Makes sure the request is from a user with administrator privileges.
	 * @param {object} req An express request object.  Holds the session.
	 * @param {object} res An express response object.
	 * @param {function} next The next handler in the express chain.  Generally, it's the endpoint that requires user authentication.
	 * @returns {void}
	 */
	is_admin (req, res, next) {
		logger.debug('Checking for admin privileges');

		if (!this.admin_password || !this.admin_user) {
			logger.warn('Admin username and password are not set.  Letting the user through');
			next();
			return;
		}

		// parse login and password from headers
		const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
		const [ login, password ] = new Buffer(b64auth, 'base64').toString().split(':');

		// Verify login and password are set and correct
		if (login && password && login === this.admin_user && password === this.admin_password) {
			// Access granted...
			logger.info('User has admin privileges');
			next();
			return;
		}

		logger.info('User does not have admin privileges');
		res.setHeader('WWW-Authenticate', `Basic realm="${this.realm}"`);
		res.status(401).json({
			error: 'NOT_AUTHORIZED',
			reason: 'You do not have admin access'
		});
	}

	/**
	 * Makes sure the user is an admin or a logged in user.  Useful for API endpoints that should be usable by both
	 * parties.  Attaches an `is_admin` property to the request to help endpoints using the middleware distinguish
	 * between requests from admins and requests from logged in users.
	 * @param {object} req An express request object.  Holds the session.
	 * @param {object} res An express response object.
	 * @param {function} next The next handler in the express chain.  Generally, it's the endpoint that requires user authentication.
	 * @returns {void}
	 */
	is_admin_or_user (req, res, next) {
		logger.debug('Making sure the user is an admin or a user');

		if (!this.admin_password || !this.admin_user) {

			logger.warn('Admin username and password are not set.  Letting the user through');
			req.is_admin = true;
			next();
			return;

		} else {

			// parse login and password from headers
			const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
			const [ login, password ] = new Buffer(b64auth, 'base64').toString().split(':');

			// Verify login and password are set and correct
			if (login && password && login === this.admin_user && password === this.admin_password) {
				// Access granted...
				logger.info('User has admin privileges');
				req.is_admin = true;
				next();
				return;
			} else {
				logger.info('User is not an admin');
			}
		}

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
	}

	/**
	 * Only sessions with logged in users will get past this middleware.
	 * @param {object} req An express request object.  Holds the session.
	 * @param {object} res An express response object.
	 * @param {function} next The next handler in the express chain.  Generally, it's the endpoint that requires user authentication.
	 * @returns {void}
	 */
	is_logged_in (req, res, next) {
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
	}

	/**
	 * Redirects a user to the login page unless they are logged in, meaning the `user_id` field is filled out in their
	 * session (login endpoints should do this).
	 * @param {object} req An express request object.  Holds the session.
	 * @param {object} res An express response object.  Used to redirect users that aren't logged in.
	 * @param {function} next The next handler in the express chain.  Generally, it's the endpoint that requires user authentication.
	 * @returns {void}
	 */
	user_authentication (req, res, next) {
		logger.debug(`User session: ${JSON.stringify(req.session)}`);
		if (req && req.session && req.session.user_id && typeof req.session.user_id === 'string') {
			logger.info(`User ${req.session.user_id} is logged in`);
			next();
		} else {
			logger.info('User is not logged in. Redirecting to /login');
			res.redirect('/login');
		}
	}
}
module.exports.Middleware = Middleware;