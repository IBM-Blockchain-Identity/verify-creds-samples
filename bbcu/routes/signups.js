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
 * @param {Agent} agent An agent instance associated with this web app.
 * @param {SignupManager} signup_manager A SignupManager instance for managing new user signups.
 * @returns {object} An express router for the login API.
 */
exports.createRouter = function (agent, signup_manager) {

	if (!agent || typeof agent.getCredentialDefinitions !== 'function')
		throw new TypeError('Signups API was not given an Agent');
	if (!signup_manager || typeof signup_manager.create_signup !== 'function')
		throw new TypeError('Signups API was not given a signup manager');

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

	/* Get the proof schema for the signup flow */
	router.get('/signup/proofschema', [ middleware ], async (req, res) => {

		const proof_schema = await signup_manager.get_signup_schema();
		logger.debug(`Signup proofschema found ${proof_schema !== null}, proofschema name: ${proof_schema ? proof_schema.name : ''}`);

		res.status(200).json({
			message: 'Proof schema retrieved',
			proof_schema: proof_schema
		});
	});

	/* create new proof schema from latest credential definition */
	router.post('/signup/proofschema', async (req, res, next) => {
		try {

			const proof_request = await signup_manager.get_signup_schema();

			const account_proof_schema = await agent.createProofSchema(proof_request.name, proof_request.version,
				proof_request.requested_attributes, proof_request.requested_predicates);
			logger.debug(`Created proof schema: ${JSON.stringify(account_proof_schema)}`);
			res.status(201).json({
				message: 'Signup proof schema created',
				proof_schema: account_proof_schema
			});
		} catch (error) {
			error.code = error.code ? error.code : SIGNUP_API_ERRORS.UNKNOWN_SIGNUP_API_ERROR;
			return res.status(500).send({error: error.code, reason: error.message});
		}
	});

	/* POST start a new account signup flow */
	router.post('/signup', [ middleware ], (req, res) => {
		if (!req.body || !req.body.proof_schema_id ||
			(req.body.qr_code_nonce && (req.body.username === undefined || req.body.username === null)) ||
			(!req.body.qr_code_nonce && !req.body.username) ||
			typeof req.body.username !== 'string') {

			// if this signup is triggered from a QR code, an emtpy username is fine
			return res.status(400).json({
				error: SIGNUP_API_ERRORS.MISSING_REQUIRED_PARAMETERS,
				reason: 'You must supply appropriate information in order to signup'
			});
		}
		const username = req.body.username;

		if (!req.body.qr_code_nonce && (!req.body.password || typeof req.body.password !== 'string')) {
			return res.status(400).json({
				error: SIGNUP_API_ERRORS.MISSING_REQUIRED_PARAMETERS,
				reason: 'You must supply a password in order to log in'
			});
		}
		const password = req.body.password;

		if (!req.body.qr_code_nonce && (!req.body.invitation_url || typeof req.body.invitation_url !== 'string')) {
			return res.status(400).json({
				error: SIGNUP_API_ERRORS.MISSING_REQUIRED_PARAMETERS,
				reason: 'You must supply an invitation url in order to log in'
			});
		}
		const invitation_url = req.body.invitation_url;
		const signup_id = signup_manager.create_signup(username, invitation_url, password, req.body.proof_schema_id, req.body.qr_code_nonce);
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