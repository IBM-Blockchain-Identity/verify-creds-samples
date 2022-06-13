/**
 © Copyright IBM Corp. 2019, 2020

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

const express = require('express');
const bodyParser = require('body-parser');
const compression = require('compression');

const SIGNUP_STEPS = require('../libs/signups.js').SIGNUP_STEPS;

// Logging setup
const Logger = require('../libs/logger.js').Logger;
const logger = Logger.makeLogger(Logger.logPrefix(__filename));

/**
 * Creates an express router for all the REST endpoints related to logging in and out of the app.
 * @param {SignupManager} signup_manager A SignupManager instance for managing new user signups.
 * @returns {object} An express router for the login API.
 */
exports.createRouter = function (signup_manager) {

	if (!signup_manager || typeof signup_manager.create_signup !== 'function')
		throw new TypeError('Users API was not given a signup manager');

	const router = express.Router();
	router.use(bodyParser.urlencoded({extended: true}));
	router.use(bodyParser.json());
	router.use(bodyParser.text());
	router.use(compression());

	/* Get the status of the current signup flow */
	router.get('/signup/status', [ middleware ], (req, res) => {

		if (!req.session.signup)
			return res.status(400).json({
				error: SIGNUP_API_ERRORS.NOT_SIGNING_UP,
				reason: 'There is no signup process associate with this session'
			});

		const status = signup_manager.get_signup_status(req.session.signup);
		logger.debug(`Signup ${req.session.signup} status is ${status.status}`);
		if (status.status === SIGNUP_STEPS.FINISHED) {
			// Log the user in and cleanup the signup and session when the signup is complete
			req.session.user_id = signup_manager.get_signup_user(req.session.signup);
			res.cookie('user_id', req.session.user_id);

			signup_manager.delete_signup(req.session.signup);
			delete req.session.signup;
			res.json({
				message: 'User has been signed up and logged in',
				signup: status
			});

		} else {
			res.json({
				message: 'Retrieved signup status',
				signup: status
			});
		}
	});

	/* POST start a new account signup flow */
	router.post('/signup', [ middleware ], (req, res) => {
		if (!req.body || !req.body.username || typeof req.body.username !== 'string') {
			return res.status(400).json({
				error: SIGNUP_API_ERRORS.MISSING_REQUIRED_PARAMETERS,
				reason: 'You must supply a username in order to log in'
			});
		}
		const username = req.body.username;

		if (!req.body.password || typeof req.body.password !== 'string') {
			return res.status(400).json({
				error: SIGNUP_API_ERRORS.MISSING_REQUIRED_PARAMETERS,
				reason: 'You must supply a password in order to log in'
			});
		}
		const password = req.body.password;

		if (!req.body.agent_name || typeof req.body.agent_name !== 'string') {
			return res.status(400).json({
				error: SIGNUP_API_ERRORS.MISSING_REQUIRED_PARAMETERS,
				reason: 'You must supply an agent name in order to log in'
			});
		}
		const agent_name = req.body.agent_name;

		const signup_id = signup_manager.create_signup(username, agent_name, password);
		req.session.signup = signup_id;
		res.status(201).json({
			message: 'Signup process initiated',
			signup: signup_id
		});
	});

	return router;
};

/**
 * Makes sure we don't allow logged in users to sign up for an account.
 * @param {object} req An express request object.
 * @param {object} res An express.js request object.
 * @param {function} next Represents the next handler function in the express handler
 * @returns {void}
 */
function middleware (req, res, next) {
	if (req.session.user_id)
		return res.status(400).json({
			error: SIGNUP_API_ERRORS.ALREADY_SIGNED_IN,
			reason: 'Cannot sign up if you\'re already logged in as a user'
		});

	next();
}

const SIGNUP_API_ERRORS = {
	MISSING_REQUIRED_PARAMETERS: 'MISSING_REQUIRED_PARAMETERS',
	NOT_SIGNING_UP: 'NOT_SIGNING_UP',
	ALREADY_SIGNED_IN: 'ALREADY_SIGNED_IN',
	UNKNOWN_SIGNUP_API_ERROR: 'UNKNOWN_SIGNUP_API_ERROR',
	SIGNUP_USER_ALREADY_EXISTS: 'SIGNUP_USER_ALREADY_EXISTS'
};

exports.SIGNUP_API_ERRORS = SIGNUP_API_ERRORS;