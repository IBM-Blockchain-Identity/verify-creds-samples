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

const uuidv4 = require('uuid/v4');
const semverCompare = require('semver-compare');

const Logger = require('./logger.js').Logger;
const logger = Logger.makeLogger(Logger.logPrefix(__filename));

/**
 * Tracks and manages all the Login flows.  Should clean up old login flows
 */
class LoginManager {

	/**
	 * @param {Agent} agent An agent for connecting to and logging in users.
	 * @param {Users} user_records A Users instance with access to personal data for checking credentials.
	 * @param {ImageProvider} connection_icon_provider Provides the image data for connection offers.
	 * @param {ProofHelper} login_helper Provides proof schemas and checks proof responses for VC logins.
	 */
	constructor (agent, user_records, connection_icon_provider, login_helper) {
		if (!agent || typeof agent.createVerification !== 'function')
			throw new TypeError('LoginManager was not given an Agent instance');
		if (!user_records || typeof user_records.read_user !== 'function')
			throw new TypeError('LoginManager was not given a Users instance');
		if (!connection_icon_provider || typeof connection_icon_provider.getImage !== 'function')
			throw new TypeError('LoginManager was not given an ImageProvider instance');
		if (!login_helper || typeof login_helper.getProofSchema !== 'function')
			throw new TypeError('LoginManager was not given a ProofHelper instance');

		this.agent = agent;
		this.user_records = user_records;
		this.logins = {};
		this.connection_icon_provider = connection_icon_provider;
		this.login_helper = login_helper;
	}

	/**
	 * Creates an Login flow for the given user.
	 * @param {string} user The app user we want to log in.
	 * @param {ConnectionMethod} connection_method The method for connecting to the user.
	 * @returns {string} A Login instance ID to be used to check the status of the Login later.
	 */
	create_login (user, connection_method) {
		if (!user || typeof user !== 'string')
			throw new TypeError('Invalid user was provided to login manager');
		if (!connection_method || typeof connection_method !== 'string')
			throw new TypeError('Invalid connection method for logging in');

		const login_id = uuidv4();
		logger.info(`Creating login ${login_id}`);
		this.logins[login_id] = new Login(login_id, this.agent, user, this.user_records, this.connection_icon_provider, this.login_helper, connection_method);
		this.logins[login_id].start();
		return login_id;
	}

	/**
	 * Gets the status of a given Login.
	 * @param {string} login_id The ID of the Login to check.
	 * @returns {LoginStatus} The status of the given Login.
	 */
	get_login_status (login_id) {
		if (!login_id || typeof login_id !== 'string')
			throw new TypeError('Invalid login ID was provided to login manager');

		if (!this.logins[login_id]) {
			const error = new Error(`Login ${login_id} was not found in Login list`);
			error.code = LOGIN_MANAGER_ERRORS.LOGIN_NOT_FOUND;
			throw error;
		}

		return this.logins[login_id].getStatus();
	}


	/**
	 * Retrieves the user for the given login flow.  When the login flow is complete, this lets the caller know who is
	 * clear to be logged in when a Login has finished.
	 * @param {string} login_id The ID of a Login.
	 * @return {string} The user ID associated with the given login flow.
	 */
	get_login_user (login_id) {
		if (!login_id || typeof login_id !== 'string')
			throw new TypeError('Invalid login ID was provided to login manager');

		if (!this.logins[login_id]) {
			const error = new Error(`Login ${login_id} was not found in Login list`);
			error.code = LOGIN_MANAGER_ERRORS.LOGIN_NOT_FOUND;
			throw error;
		}

		return this.logins[login_id].user;
	}

	/**
	 * Stops the given Login and deletes it from the Login list.
	 *
	 * @param {string} login_id The ID of a running Login.
	 * @returns {void}
	 */
	delete_login (login_id) {
		if (!login_id || typeof login_id !== 'string')
			throw new TypeError('Invalid login ID was provided to login manager');

		if (!this.logins[login_id]) {
			const error = new Error(`Login ${login_id} was not found in Login list`);
			error.code = LOGIN_MANAGER_ERRORS.LOGIN_NOT_FOUND;
			throw error;
		}
		const login = this.logins[login_id];
		delete this.logins[login_id];

		if ([
			Login.LOGIN_STEPS.FINISHED,
			Login.LOGIN_STEPS.ERROR,
			Login.LOGIN_STEPS.STOPPED
		].indexOf(login.getStatus().status) >= 0) {
			return;
		}
		login.stop();
	}
}
exports.LoginManager = LoginManager;

const LOGIN_MANAGER_ERRORS = {
	LOGIN_NOT_FOUND: 'LOGIN_NOT_FOUND',
	LOGIN_ALREADY_STOPPED: 'LOGIN_ALREADY_STOPPED'
};
exports.LOGIN_MANAGER_ERRORS = LOGIN_MANAGER_ERRORS;

/**
 * Connects and verifies a credential to a given agent name.  Because this is a potentially long-running process,
 * this class has methods to start, stop, and check the status of the flow.  This allows the UI to be able to keep track
 * of where the flow is and update the user accordingly.
 */
class Login {

	/**
	 * @enum {string}
	 * @returns {{CREATED: string, ESTABLISHING_CONNECTION: string, CHECKING_CREDENTIAL: string, FINISHED: string, STOPPED: string, ERROR: string}} The possible states
	 * @constructor
	 */
	static get LOGIN_STEPS () {
		return {
			CREATED: 'CREATED',
			ESTABLISHING_CONNECTION: 'ESTABLISHING_CONNECTION',
			CHECKING_CREDENTIAL: 'CHECKING_CREDENTIAL',
			FINISHED: 'FINISHED',
			STOPPED: 'STOPPED',
			ERROR: 'ERROR'
		};
	}

	/**
	 * Describes a method for establishing a connection with another agent.  Out-of-band connections require a user to
	 * post a connection offer to their agent to establish a connection.  In-band connections only require a user to
	 * accept a connection offer that was automatically delivered to their agent.  Invitations are like out-of-band
	 * connections in that they require the user to post the invitation to their agent, but invitations can be accepted
	 * by multiple users.
	 *
	 * @typedef {'out_of_band'|'in_band'|'invitation'} ConnectionMethod
	 */

	/**
	 * @param {string} id The ID for looking up this Login instance.
	 * @param {Agent} agent An agent to connect to users and send credential offers.
	 * @param {string} user The user to connect with.
	 * @param {Users} user_records The database of app Users where personal information is stored.
	 * @param {ImageProvider} connection_icon_provider Provides the image data for connection offers.
	 * @param {ProofHelper} login_helper Provides proof schemas and checks proof responses.
	 * @param {ConnectionMethod} connection_method The method for establishing the connection to the user
	 */
	constructor (id, agent, user, user_records, connection_icon_provider, login_helper, connection_method) {
		this.id = id;
		this.agent = agent;
		this.user = user;
		this.agent_name = null; // acquired from the user records.
		this.user_records = user_records;
		this.status = Login.LOGIN_STEPS.CREATED;
		this.error = null;
		this.connection_icon_provider = connection_icon_provider;
		this.login_helper = login_helper;
		this.connection_offer = null;
		this.verification = null;
		this.connection_method = connection_method;
	}

	/**
	 * Starts the Login and begins delivering a credential to the user.
	 * @returns {Promise<void>} Resolves when the login has finished, been stopped, or had an error.
	 */
	async start () {
		// Get icon to use for connection and credential
		const icon = await this.connection_icon_provider.getImage();

		try {

			logger.info(`Starting credential login flow ${this.id}`);

			logger.info(`Getting credential data for ${this.user}`);
			const user_doc = await this.user_records.read_user(this.user);

			const my_credential_definitions = await this.agent.getCredentialDefinitions();
			logger.debug(`${this.agent.user}'s list of credential definitions: ${JSON.stringify(my_credential_definitions, 0, 1)}`);

			if (!my_credential_definitions.length) {
				const err = new Error(`No credential definitions were found for issuer ${this.agent.user}!`);
				err.code = LOGIN_ERRORS.LOGIN_NO_CREDENTIAL_DEFINITIONS;
				throw err;
			}
			my_credential_definitions.sort(sortSchemas).reverse();
			const cred_def_id = my_credential_definitions[0].id;

			logger.debug(`Checking for attributes with credential definition id ${cred_def_id}`);
			const proof_request = await this.login_helper.getProofSchema({
				restrictions: [ {cred_def_id: my_credential_definitions[0].id} ]
			});

			const account_proof_schema = await this.agent.createProofSchema(proof_request.name, proof_request.version,
				proof_request.requested_attributes, proof_request.requested_predicates);
			logger.debug(`Created proof schema: ${JSON.stringify(account_proof_schema)}`);

			this.status = Login.LOGIN_STEPS.ESTABLISHING_CONNECTION;
			logger.info(`Connection to user via the ${this.connection_method} method`);
			const connection_opts = icon ? {icon: icon} : null;
			let connection;

			try {

				if (this.connection_method === 'in_band') {

					if (!user_doc.opts || !user_doc.opts.agent_name) {
						const err = new Error('User record does not have an associated agent name');
						err.code = LOGIN_ERRORS.AGENT_NOT_FOUND;
						throw err;
					}

					let connection_to = user_doc.opts.agent_name;
					if (typeof connection_to === 'string') {
						if (connection_to.toLowerCase().indexOf('http') >= 0)
							connection_to = {url: connection_to};
						else
							connection_to = {name: connection_to};
					}
					logger.info(`Sending connection offer to ${JSON.stringify(connection_to)}`);
					this.connection_offer = await this.agent.createConnection(connection_to, connection_opts);
					logger.info(`Sent connection offer ${this.connection_offer.id} to ${user_doc.opts.agent_name}`);
					connection = await this.agent.waitForConnection(this.connection_offer.id, 30, 3000);

				} else if (this.connection_method === 'out_of_band') {

					this.connection_offer = await this.agent.createConnection(null, connection_opts);
					logger.info(`Created out-of-band connection offer ${this.connection_offer.id}`);
					connection = await this.agent.waitForConnection(this.connection_offer.id, 30, 3000);

				} else {
					const error = new Error(`An invalid connection method was used: ${this.connection_method}`);
					logger.error(`Credential issuance could not proceed: ${error}`);
					error.code = LOGIN_ERRORS.LOGIN_INVALID_CONNECTION_METHOD;
					throw error;
				}

			} catch (error) {
				logger.error(`Failed to establish a connection with the user. error: ${error}`);
				error.code = error.code ? error.code : LOGIN_ERRORS.LOGIN_CONNECTION_FAILED;
				if (this.connection_offer && this.connection_offer.id) {
					logger.info(`Cleaning up connection offer ${this.connection_offer.id}`);
					await this.agent.deleteConnection(this.connection_offer.id);
				}
				throw error;
			}
			logger.info(`Established connection ${connection.id}.  Their DID: ${connection.remote.pairwise.did}`);

			this.status = Login.LOGIN_STEPS.CHECKING_CREDENTIAL;

			// If no proof requests, then send request
			logger.info(`Sending proof request to ${connection.remote.pairwise.did}`);
			try {
				this.verification = await this.agent.createVerification({
					did: connection.remote.pairwise.did
				},
				account_proof_schema.id,
				'outbound_proof_request',
				{
					icon: icon
				});
			} catch (error) {
				logger.error(`Sending login proof request failed.  Deleting connection ${connection.id}. error: ${error}`);
				error.code = error.code ? error.code : LOGIN_ERRORS.LOGIN_VERIFICATION_FAILED;
				await this.agent.deleteConnection(connection.id);
				throw error;
			}
			logger.info(`Created verification request: ${this.verification.id}`);

			logger.info(`Waiting for verification of proof request from ${connection.remote.pairwise.did}`);
			let proof;
			try {
				proof = await this.agent.waitForVerification(this.verification.id, 30, 3000);
			} catch (error) {
				logger.error(`Failed to complete verification ${this.verification.id}. Deleting verification. error: ${error}`);
				error.code = error.code ? error.code : LOGIN_ERRORS.LOGIN_VERIFICATION_FAILED;
				await this.agent.deleteVerification(this.verification.id);
				throw error;
			}

			logger.info(`Final state for verification ${proof.id}: ${proof.state}`);
			if (proof.state === 'passed') {
				logger.info(`Verification ${proof.id} to ${connection.remote.pairwise.did} passed crypto validation`);
			} else {
				const error = new Error(`Verification ${proof.id} did not pass validation.  Deleting verification`);
				error.code = LOGIN_ERRORS.LOGIN_PROOF_VALIDATION_FAILED;
				logger.error(error.message);
				await this.agent.deleteVerification(proof.id);
				throw error;
			}

			logger.info(`Deleting verification request ${proof.id}`);
			await this.agent.deleteVerification(proof.id);

			logger.info(`Checking the validity of the proof in verification ${proof.id}`);
			try {
				await this.login_helper.checkProof(proof, user_doc);
			} catch (error) {
				error.code = error.code ? error.code : LOGIN_ERRORS.LOGIN_PROOF_VALIDATION_FAILED;
				throw error;
			}

			logger.info(`Login flow ${this.id} completed successfully`);
			this.status = Login.LOGIN_STEPS.FINISHED;

		} catch (error) {
			error.code = error.code ? error.code : LOGIN_ERRORS.LOGIN_UNKNOWN_ERROR;
			logger.error(`Login failed: ${error.code} ${error.message}`);
			this.status = Login.LOGIN_STEPS.ERROR;
			this.error = error;
		}
	}

	/**
	 * Stops this Login, meaning that the Login will still finish whatever the current Login task is, such as
	 * verifying a credential, but will cease activity before the next task.
	 * @returns {void}
	 */
	stop () {
		logger.info(`Stopping credential login flow ${this.id}`);
		this.status = Login.LOGIN_STEPS.STOPPED;
	}

	/**
	 * @typedef {object} LoginStatus
	 * @property {LOGIN_STEPS} status The status of the Login.
	 * @property {error} [error] The error that occurred, if the login status is ERROR.
	 */
	/**
	 * Gets the status of the Login.
	 * @returns {LoginStatus} Information on the status of the Login
	 */
	getStatus () {
		logger.debug(`Status of credential login ${this.id}: ${this.status}`);
		const ret = {
			status: this.status
		};

		if (this.error) {
			ret.error = this.error.code ? this.error.code : LOGIN_ERRORS.LOGIN_UNKNOWN_ERROR;
			ret.reason = this.error.message;
		}

		if (this.status === Login.LOGIN_STEPS.ESTABLISHING_CONNECTION && this.connection_offer)
			ret.connection_offer = this.connection_offer;

		// Just pass the ID until we know we need more.  Verification objects are large.
		if (this.status === Login.LOGIN_STEPS.CHECKING_CREDENTIAL && this.verification)
			ret.verification = {id: this.verification.id};

		return ret;
	}
}

/**
 * Sorts schema objects from the cloud agent API based on their schema version number, which
 * we assume is the order in which they were meant to be published (1.1 then 1.2 then 1.3...)
 * @param {object} a A schema object.
 * @param {object} b A schema object.
 * @return {number} <0 if a comes before b, 0 if they are the same, >0 if b comes before a
 */
function sortSchemas (a, b) {
	return semverCompare(a.schema.version, b.schema.version);
}

exports.LOGIN_STEPS = Login.LOGIN_STEPS;

const LOGIN_ERRORS = {
	LOGIN_PROOF_VALIDATION_FAILED: 'LOGIN_PROOF_VALIDATION_FAILED',
	LOGIN_VERIFICATION_FAILED: 'LOGIN_VERIFICATION_FAILED',
	AGENT_NOT_FOUND: 'SIGNUP_HOLDER_AGENT_NOT_FOUND',
	LOGIN_UNKNOWN_ERROR: 'LOGIN_UNKNOWN_ERROR',
	LOGIN_NO_CREDENTIAL_DEFINITIONS: 'LOGIN_NO_CREDENTIAL_DEFINITIONS',
	LOGIN_INVALID_CONNECTION_METHOD: 'LOGIN_INVALID_CONNECTION_METHOD',
	LOGIN_CONNECTION_FAILED: 'LOGIN_CONNECTION_FAILED'
};

exports.LOGIN_ERRORS = LOGIN_ERRORS;
