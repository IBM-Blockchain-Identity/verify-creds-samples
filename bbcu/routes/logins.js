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
const semverCompare = require('semver-compare');

const LOGIN_STEPS = require('../libs/logins.js').LOGIN_STEPS;

// Logging setup
const Logger = require('../libs/logger.js').Logger;
const logger = Logger.makeLogger(Logger.logPrefix(__filename));

/**
 * Creates an express router for all the REST endpoints related to logging in and out of the app.
 * @param {Agent} agent An agent instance associated with this web app.
 * @param {object} users_instance An instance of the Users class with a backend user database.
 * @param {object} login_manager A LoginManager to manage login flows.
 * @returns {object} An express router for the login API.
 */
exports.createRouter = function (agent, users_instance, login_manager) {

	if (!agent || typeof agent.getCredentialDefinitions !== 'function')
		throw new TypeError('Login API was not given an Agent');
	if (!users_instance || typeof users_instance.read_user !== 'function')
		throw new TypeError('Login API was not given a Users instance');

	if (!login_manager || typeof login_manager.create_login !== 'function')
		throw new TypeError('Login API was not given a LoginManager instance');

	const router = express.Router();
	router.use(bodyParser.urlencoded({extended: true}));
	router.use(bodyParser.json());
	router.use(bodyParser.text());
	router.use(compression());

	// Log in using username and password
	router.post('/login/userpass', async (req, res) => {
		if (!req.body || !req.body.username || typeof req.body.username !== 'string') {
			return res.status(400).json({
				error: LOGIN_API_ERRORS.BAD_REQUEST,
				reason: 'You must supply a username in order to log in'
			});
		}
		const username = req.body.username;

		if (!req.body || typeof req.body.password !== 'string') {
			return res.status(400).json({
				error: LOGIN_API_ERRORS.BAD_REQUEST,
				reason: 'You must supply a password in order to log in'
			});
		}
		const password = req.body.password;
		try {
			if (!await users_instance.checkPassword(username, password))
				throw new Error();

			// Users are "logged in" if they have a user id associate with the session
			req.session.user_id = username;
			res.cookie('user_id', req.session.user_id);

			res.send({
				message: 'OK'
			});

		} catch (error) {
			return res.status(401).json({
				error: LOGIN_API_ERRORS.NOT_AUTHORIZED,
				reason: 'Username or password was incorrect'
			});
		}
	});

	// Log out
	router.get('/logout', (req, res, next) => {
		if (req.session) {
			// delete session object
			req.session.destroy((err) => {
				if (err) {
					return next(err);
				} else {
					return res.redirect('/');
				}
			});
		} else {
			return res.redirect('/');
		}
	});

	// Start VC login flow
	router.post('/login/vc', (req, res, next) => {
		if (!req.body || !req.body.proof_schema_id || typeof req.body.proof_schema_id !== 'string' ||
			(req.body.qr_code_nonce && (req.body.username === undefined || req.body.username === null)) ||
			(!req.body.qr_code_nonce && !req.body.username) ||
			typeof req.body.username !== 'string') {

			// if this login is triggered from a QR code, an emtpy username is fine
			return res.status(400).json({
				error: LOGIN_API_ERRORS.BAD_REQUEST,
				reason: 'You must supply a username in order to log in'
			});
		}
		const username = req.body.username;
		const login_id = login_manager.create_login(username, req.body.proof_schema_id, req.body.qr_code_nonce);

		// Calls to the status API will be determined by the login associated with the session
		req.session.vc_login = login_id;
		res.status(201).json({
			message: 'VC login process initiated',
			vc_login: login_id
		});
	});

	// Check the status of the VC login flow
	router.get('/login/vc/status', (req, res, next) => {

		if (!req.session.vc_login)
			return res.status(400).json({
				error: LOGIN_API_ERRORS.NOT_LOGGING_IN,
				reason: 'There is no VC login process associated with this session'
			});

		const status = login_manager.get_login_status(req.session.vc_login);
		if (status.status === LOGIN_STEPS.FINISHED) {
			// If login is completed, update the session to log the user in
			req.session.user_id = login_manager.get_login_user(req.session.vc_login);
			res.cookie('user_id', req.session.user_id);

			// Cleanup the VC login
			login_manager.delete_login(req.session.vc_login);
			delete req.session.vc_login;
			logger.info(`VC Login was successful for ${req.session.user_id}`);
			res.json({
				message: 'VC login was successful',
				vc_login: status
			});

		} else {
			res.json({
				message: 'Retrieved VC login status',
				vc_login: status
			});
		}
	});

	/* create new proof schema from latest credential definition */
	router.post('/login/proofschema', async (req, res, next) => {
		try {
			const my_credential_definitions = await agent.getCredentialDefinitions();
			logger.debug(`${agent.user}'s list of credential definitions: ${JSON.stringify(my_credential_definitions, 0, 1)}`);

			if (!my_credential_definitions.length) {
				const err = new Error(`No credential definitions were found for issuer ${agent.user}!`);
				err.code = LOGIN_API_ERRORS.LOGIN_NO_CREDENTIAL_DEFINITIONS;
				throw err;
			}
			my_credential_definitions.sort(sortSchemas).reverse();
			const cred_def_id = my_credential_definitions[0].id;

			logger.debug(`Checking for attributes with credential definition id ${cred_def_id}`);
			const proof_request = await login_manager.get_login_schema({
				restrictions: [ {cred_def_id: my_credential_definitions[0].id} ]
			});

			const account_proof_schema = await agent.createProofSchema(proof_request.name, proof_request.version,
				proof_request.requested_attributes, proof_request.requested_predicates);
			logger.debug(`Created proof schema: ${JSON.stringify(account_proof_schema)}`);

			res.status(201).json({
				message: 'Signup proof schema created',
				proof_schema: account_proof_schema
			});
		} catch (error) {
			error.code = error.code ? error.code : LOGIN_API_ERRORS.UNKNOWN_LOGIN_API_ERROR;
			return res.status(500).send({error: error.code, reason: error.message});
		}
	});

	return router;
};

/**
 * Sorts schema objects from the cloud agent API based on their schema version number, which
 * we assume is the order in which they were meant to be published (1.1 then 1.2 then 1.3...)
 * @param {object} a A schema object.
 * @param {object} b A schema object.
 * @return {number} <0 if a comes before b, 0 if they are the same, >0 if b comes before a
 */
 function sortSchemas (a, b) {
	if(a.hasOwnProperty("version")) {
		return semverCompare(a.version, b.version);
	}
	return semverCompare(a.schema.version, b.schema.version);
}

const LOGIN_API_ERRORS = {
	BAD_REQUEST: 'BAD_REQUEST',
	NOT_AUTHORIZED: 'NOT_AUTHORIZED',
	NOT_LOGGING_IN: 'NOT_LOGGING_IN',
	LOGIN_NO_CREDENTIAL_DEFINITIONS: 'LOGIN_NO_CREDENTIAL_DEFINITIONS',
	UNKNOWN_LOGIN_API_ERROR: 'UNKNOWN_LOGIN_API_ERROR'
};

exports.LOGIN_API_ERRORS = LOGIN_API_ERRORS;