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
const InboundNonceWatcher = require('./helpers.js').InboundNonceWatcher;

const Logger = require('./logger.js').Logger;
const logger = Logger.makeLogger(Logger.logPrefix(__filename));

/**
 * Tracks and manages all the Signup flows.  Should clean up old Signup flows
 */
class SignupManager {

	/**
	 * @param {Agent} agent An agent for connecting to and signing up users.
	 * @param {Users} user_records A Users instance for creating users.
	 * @param {CardRenderer} card_renderer The renderer for the credentials.
	 * @param {ImageProvider} connection_icon_provider Provides the image data for connection offers.
	 * @param {SignupHelper} signup_helper Manages proof schemas and user record creation.
	 */
	constructor (agent, user_records, card_renderer, connection_icon_provider, signup_helper) {
		if (!agent || typeof agent.createVerification !== 'function')
			throw new TypeError('SignupManager was not given an Agent instance');
		if (!user_records || typeof user_records.read_user !== 'function')
			throw new TypeError('SignupManager was not given a Users instance');
		if (!card_renderer || typeof card_renderer.createCardFront !== 'function')
			throw new TypeError('SignupManager was not given a CardRenderer instance');
		if (!connection_icon_provider || typeof connection_icon_provider.getImage !== 'function')
			throw new TypeError('SignupManager was not given an ImageProvider instance');
		if (!signup_helper || typeof signup_helper.proofToUserRecord !== 'function')
			throw new TypeError('SignupManager was not given a SignupHelper instance');

		this.agent = agent;
		this.user_records = user_records;
		this.signups = {};
		this.card_renderer = card_renderer;
		this.connection_icon_provider = connection_icon_provider;
		this.signup_helper = signup_helper;
	}

	/**
	 * Creates an Signup flow for the given user.
	 * @param {string} user The app user we want to sign up.
	 * @param {string} agent_name The agent name associated with the user.
	 * @param {string} password The new user's password.
	 * @param {string} qr_code_nonce The nonce provided in the qrCode that is initiating this signup.
	 * @returns {string} A Signup instance ID to be used to check the status of the Signup later.
	 */
	create_signup (user, agent_name, password, qr_code_nonce=null) {
		if ((!qr_code_nonce && (!user || typeof user !== 'string')) ||
			(qr_code_nonce && (user === undefined || user === null || typeof user !== 'string')))
			throw new TypeError('Invalid user was provided to signup manager');
		if (!qr_code_nonce && (!agent_name || typeof agent_name !== 'string'))
			throw new TypeError('Invalid agent name provided to signup manager');
		if (!qr_code_nonce && (!password || typeof password !== 'string'))
			throw new TypeError('Invalid password provided to signup manager');

		const signup_id = uuidv4();
		logger.info(`Creating signup ${signup_id}`);
		this.signups[signup_id] = new Signup(signup_id, agent_name, this.agent, user, password, this.user_records, this.card_renderer, this.connection_icon_provider, this.signup_helper, qr_code_nonce);
		this.signups[signup_id].start();
		return signup_id;
	}

	/**
	 * Gets the status of a given Signup.
	 * @param {string} signup_id The ID of the Signup to check.
	 * @returns {SignupStatus} The status of the given Signup.
	 */
	get_signup_status (signup_id) {
		if (!signup_id || typeof signup_id !== 'string')
			throw new TypeError('Invalid signup ID was provided to signup manager');

		if (!this.signups[signup_id]) {
			const error = new Error(`Signup ${signup_id} was not found in Signup list`);
			error.code = SIGNUP_MANAGER_ERRORS.SIGNUP_NOT_FOUND;
			throw error;
		}

		return this.signups[signup_id].getStatus();
	}


	/**
	 * Retrieves the user for the given signup flow.  When the signup flow is complete, this lets the caller know who is
	 * clear to be logged in when a Signup has finished.
	 * @param {string} signup_id The ID of a Signup.
	 * @return {string} The user ID associated with the given signup flow.
	 */
	get_signup_user (signup_id) {
		if (!signup_id || typeof signup_id !== 'string')
			throw new TypeError('Invalid signup ID was provided to signup manager');

		if (!this.signups[signup_id]) {
			const error = new Error(`Signup ${signup_id} was not found in Signup list`);
			error.code = SIGNUP_MANAGER_ERRORS.SIGNUP_NOT_FOUND;
			throw error;
		}

		return this.signups[signup_id].user;
	}

	/**
	 * Stops the given Signup and deletes it from the Signup list.
	 *
	 * @param {string} signup_id The ID of a running Signup.
	 * @returns {void}
	 */
	delete_signup (signup_id) {
		if (!signup_id || typeof signup_id !== 'string')
			throw new TypeError('Invalid signup ID was provided to signup manager');

		if (!this.signups[signup_id]) {
			const error = new Error(`Signup ${signup_id} was not found in Signup list`);
			error.code = SIGNUP_MANAGER_ERRORS.SIGNUP_NOT_FOUND;
			throw error;
		}
		const signup = this.signups[signup_id];
		delete this.signups[signup_id];

		if ([
			Signup.SIGNUP_STEPS.FINISHED,
			Signup.SIGNUP_STEPS.ERROR,
			Signup.SIGNUP_STEPS.STOPPED
		].indexOf(signup.getStatus().status) >= 0) {
			return;
		}
		signup.stop();
	}

	/**
	 * Get schema used for signups.
	 *
	 * @returns {any} The signup proof schema
	 */
	async get_signup_schema () {
		if (!this.signup_helper)
			throw new TypeError('Signup manager has no signup helper');

		return await this.signup_helper.getProofSchema();
	}
}
exports.SignupManager = SignupManager;

const SIGNUP_MANAGER_ERRORS = {
	SIGNUP_NOT_FOUND: 'SIGNUP_NOT_FOUND'
};
exports.SIGNUP_MANAGER_ERRORS = SIGNUP_MANAGER_ERRORS;

/**
 * Connects and verifies a credential to a given agent name.  Because this is a potentially long-running process,
 * this class has methods to start, stop, and check the status of the flow.  This allows the UI to be able to keep track
 * of where the flow is and update the user accordingly.
 */
class Signup {

	/**
	 * @enum {string}
	 * @returns {{CREATED: string, ESTABLISHING_CONNECTION: string, CHECKING_CREDENTIAL: string, ISSUING_CREDENTIAL: string, FINISHED: string, STOPPED: string, ERROR: string}} The possible states
	 * @constructor
	 */
	static get SIGNUP_STEPS () {
		return {
			CREATED: 'CREATED',
			WAITING_FOR_OFFER: 'WAITING_FOR_OFFER',
			ESTABLISHING_CONNECTION: 'ESTABLISHING_CONNECTION',
			CHECKING_CREDENTIAL: 'CHECKING_CREDENTIAL',
			ISSUING_CREDENTIAL: 'ISSUING_CREDENTIAL',
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
	 * @param {string} id The ID for looking up this Signup instance.
	 * @param {string} agent_name An agent name to associate with the user.
	 * @param {Agent} agent An agent to connect to users and send credential offers.
	 * @param {string} user The user to connect with.
	 * @param {string} password The new user's password.
	 * @param {Users} user_records The database of app Users where personal information is stored.
	 * @param {CardRenderer} card_renderer The renderer for the credentials.
	 * @param {ImageProvider} connection_icon_provider Provides the image data for connection offers.
	 * @param {SignupHelper} signup_helper Manages proof schemas and user record creation.
	 * @param {string} qr_code_nonce The nonce provided in the qrCode that is initiating this signup.
	 * @returns {Signup} The created Signup object
	 */
	constructor (id, agent_name, agent, user, password, user_records, card_renderer, connection_icon_provider, signup_helper, qr_code_nonce=null) {
		this.id = id;
		this.agent = agent;
		this.user = user;
		this.password = password;
		this.agent_name = agent_name;
		this.user_records = user_records;
		this.status = Signup.SIGNUP_STEPS.CREATED;
		this.error = null;
		this.card_renderer = card_renderer;
		this.connection_icon_provider = connection_icon_provider;
		this.signup_helper = signup_helper;
		this.connection_offer = null;
		this.verification = null;
		this.credential = null;
		this.qr_code_nonce = qr_code_nonce;
	}

	/**
	 * Starts the Signup and begins verifying a user's records and creating their account.
	 * @returns {Promise<void>} Resolves when the signup has finished, been stopped, or had an error.
	 */
	async start () {
		// Get icon to use for connection and credential
		const icon = await this.connection_icon_provider.getImage();

		let connection;
		try {

			logger.info(`Starting credential signup flow ${this.id}`);

			const my_credential_definitions = await this.agent.getCredentialDefinitions();
			logger.debug(`${this.agent.user}'s list of credential definitions: ${JSON.stringify(my_credential_definitions, 0, 1)}`);

			if (!my_credential_definitions.length) {
				const err = new Error(`No credential definitions were found for issuer ${this.agent.user}!`);
				err.code = SIGNUP_ERRORS.SIGNUP_NO_CREDENTIAL_DEFINITIONS;
				throw err;
			}

			my_credential_definitions.sort(sortSchemas).reverse();
			const schema_id = my_credential_definitions[0].schema.id;
			logger.debug(`Issuing credential to new user with schema ${schema_id}`);

			const schema = await this.agent.getCredentialSchema(schema_id);
			if (!schema) {
				const err = new Error('Failed to lookup the selected schema');
				err.code = SIGNUP_ERRORS.SCHEMA_LOOKUP_FAILED;
				throw err;
			}

			logger.info(`Creating signup proof schema for schema ID: ${schema_id}`);
			const proof_request = await this.signup_helper.getProofSchema();

			const account_proof_schema = await this.agent.createProofSchema(proof_request.name, proof_request.version,
				proof_request.requested_attributes, proof_request.requested_predicates);
			logger.debug(`Created proof schema: ${JSON.stringify(account_proof_schema)}`);

			if (this.qr_code_nonce) {
				this.status = Signup.SIGNUP_STEPS.WAITING_FOR_OFFER;
			} else {
				this.status = Signup.SIGNUP_STEPS.ESTABLISHING_CONNECTION;
			}
			logger.info(`Connection to user via an invitation`);
			const connection_opts = icon ? {icon: icon} : null;
			let connection;

			try {

				if (this.qr_code_nonce) {
					// look for connection offer that has the nonce from the qr code
					const watcher = new InboundNonceWatcher(
						this.agent,
						InboundNonceWatcher.REQUEST_TYPES.CONNECTION | InboundNonceWatcher.REQUEST_TYPES.VERIFICATION,
						this.qr_code_nonce, 30, 3000);
					const inbound_offer = await watcher.start();
					if (inbound_offer && inbound_offer.state) {
						if (inbound_offer.state === 'inbound_offer') {
							// found a connection offer with the given nonce
							this.connection_offer = inbound_offer;
							logger.info(`Received connection offer with nonce: ${this.qr_code_nonce}, offer: ${this.connection_offer.id}`);
							this.agent.acceptConnection(this.connection_offer.id);
							connection = await this.agent.waitForConnection(this.connection_offer.id, 30, 3000);
						} else if (inbound_offer.state === 'inbound_verification_request') {
							// found a verification request
							connection = inbound_offer.connection;
							this.verification = inbound_offer;
						}
					}

				} else {

					if (!user_doc.opts || !user_doc.opts.invitation_url) {
						const err = new Error('User record does not have an associated invitation url');
						err.code = SIGNUP_ERRORS.AGENT_NOT_FOUND;
						throw err;
					}

					logger.info(`Accepting invitation from ${this.user}`);
					this.connection_offer = await this.agent.acceptInvitation(user_doc.opts.invitation_url, connection_opts);
					logger.info(`Sent connection offer ${this.connection_offer.id} to ${this.user}`);
					connection = await this.agent.waitForConnection(this.connection_offer.id, 30, 3000);

				}

			} catch (error) {
				logger.error(`Failed to establish a connection with the user. error: ${error}`);
				error.code = error.code ? error.code : SIGNUP_ERRORS.SIGNUP_CONNECTION_FAILED;
				if (this.connection_offer && this.connection_offer.id) {
					logger.info(`Cleaning up connection offer ${this.connection_offer.id}`);
					await this.agent.deleteConnection(this.connection_offer.id);
				}
				throw error;
			}
			logger.info(`Established connection ${connection.id}.  Their DID: ${connection.remote.pairwise.did}`);

			this.status = Signup.SIGNUP_STEPS.CHECKING_CREDENTIAL;

			// if the user is acting off of a qr code for proof, then the next
			//  step after establishing the connection is getting the verification
			//  request
			if (this.qr_code_nonce) {
				try {
					if (this.qr_code_nonce) {
						if (!this.verification) {
							// look for verification request that has the nonce from the qr code
							const watcher = new InboundNonceWatcher(this.agent, InboundNonceWatcher.REQUEST_TYPES.VERIFICATION, this.qr_code_nonce, 30, 3000);
							this.verification = await watcher.start();
						}
						logger.info(`Received verification request with nonce: ${this.qr_code_nonce}, offer: ${this.verification.id}`);
						this.agent.updateVerification(this.verification.id, 'outbound_proof_request');
					}
				} catch (error) {
					logger.error(`Verification request never arrived.  Deleting connection ${connection.id}. error: ${error}`);
					await this.agent.deleteConnection(connection.id);
					throw error;
				}
			} else {
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
					logger.error(`Verification request failed.  Deleting connection ${connection.id}. error: ${error}`);
					await this.agent.deleteConnection(connection.id);
					throw error;
				}
				logger.info(`Created verification request: ${this.verification.id}`);
			}
			logger.info(`Waiting for verification of proof request from ${connection.remote.pairwise.did}`);
			let proof;
			try {
				proof = await this.agent.waitForVerification(this.verification.id, 30, 3000);
			} catch (error) {
				logger.error(`Failed to complete verification ${this.verification.id}. Deleting verification. error: ${error}`);
				await this.agent.deleteVerification(this.verification.id);
				throw error;
			}

			logger.info(`Final state for verification ${proof.id}: ${proof.state}`);
			if (proof.state === 'passed') {
				logger.info(`Verification ${proof.id} to ${connection.remote.pairwise.did} passed crypto validation`);
			} else {
				const error = new Error(`Verification ${proof.id} did not pass validation.  Deleting verification`);
				logger.error(error.message);
				await this.agent.deleteVerification(proof.id);
				throw error;
			}

			logger.info(`Deleting verification request ${proof.id}`);
			await this.agent.deleteVerification(proof.id);

			// check that we have received the necessary information, then create
			//  the user record in the database
			logger.info(`Checking the validity of the proof in verification ${proof.id}`);
			await this.signup_helper.checkProof(proof);

			this.status = Signup.SIGNUP_STEPS.ISSUING_CREDENTIAL;

			logger.info(`Creating user record for ${this.user}`);
			const personal_info = await this.signup_helper.proofToUserRecord(proof);
			personal_info.email = this.user;

			if (this.qr_code_nonce) {
				// if this is an account created as part of a qr code, then there is no
				//  username or password information available.  Make the username a
				//  random value.
				this.user = uuidv4();
			}

			const user_doc = await this.user_records.create_user(this.user, this.password, personal_info, {
				agent_name: this.agent_name ? this.agent_name : connection.remote.iurl,
				mobile_user: this.qr_code_nonce ? true : false
			});
			logger.debug(`User record: ${JSON.stringify(user_doc)}`);

			const cred_attributes = {};
			for (const index in schema.attrs) {
				const attr_name = schema.attrs[index];
				// Certain attributes are supposed to contain rendered images of the credential
				if (attr_name === 'card_front') {
					cred_attributes[attr_name] = await this.card_renderer.createCardFront(personal_info);
				} else if (attr_name === 'card_back') {
					cred_attributes[attr_name] = await this.card_renderer.createCardBack(personal_info);
				} else {

					// Make sure the user has data for this attribute
					if (!user_doc.personal_info || [ 'string', 'number' ].indexOf(typeof user_doc.personal_info[attr_name]) < 0) {
						const err = new Error(`User record was missing data '${attr_name}', which is required for creating a credential`);
						err.code = SIGNUP_ERRORS.LOGIN_INVALID_USER_ATTRIBUTES;
						throw err;
					}
					if (typeof user_doc.personal_info[attr_name] === 'number')
						cred_attributes[attr_name] = '' + user_doc.personal_info[attr_name];
					else
						cred_attributes[attr_name] = user_doc.personal_info[attr_name];				}
			}

			logger.info(`Sending credential offer to ${connection.remote.pairwise.did}`);
			this.credential = await this.agent.offerCredential({
				did: connection.remote.pairwise.did
			}, {
				schema_name: schema.name,
				schema_version: schema.version
			}, cred_attributes, {
				icon: icon
			});

			logger.info(`Waiting for credential offer acceptance for credential ${this.credential.id}`);
			let finished_credential;
			try {
				finished_credential = await this.agent.waitForCredential(this.credential.id, 30, 3000);
			} catch (error) {
				logger.error(`Failed to deliver credential ${this.credential.id}.  Deleting credential. error: ${error}`);
				await this.agent.deleteCredential(this.credential.id);
				throw error;
			}

			logger.info(`Final state for credential ${finished_credential.id}: ${finished_credential.state}`);
			if (finished_credential.state === 'issued') {
				logger.info(`Issued credential ${finished_credential.id} to ${connection.remote.pairwise.did}`);
				this.status = Signup.SIGNUP_STEPS.FINISHED;
			} else {
				const error = new Error(`Offered credential ${finished_credential.id} was not accepted by ${connection.remote.pairwise.did}. Deleting credential and user account.`);
				logger.error(error.message);
				await this.user_records.delete_user(this.user);
				await this.agent.deleteCredential(finished_credential.id);
				throw error;
			}

		} catch (error) {
			logger.error(`Signup failed: ${error.code ? error.code : ' '}${error}`);
			this.status = Signup.SIGNUP_STEPS.ERROR;
			this.error = error;
			if (connection && connection.id)
				await this.agent.deleteConnection(connection.id);
		}
	}

	/**
	 * Stops this Signup, meaning that the Signup will still finish whatever the current signup task is, such as
	 * verifying a credential, but will cease activity before the next task.
	 * @returns {void}
	 */
	stop () {
		logger.info(`Stopping credential signup flow ${this.id}`);
		this.status = Signup.SIGNUP_STEPS.STOPPED;
	}

	/**
	 * @typedef {object} SignupStatus
	 * @property {SIGNUP_STEPS} status The status of the Signup.
	 * @property {error} [error] The error that occurred, if the signup status is ERROR.
	 */
	/**
	 * Gets the status of the Signup.
	 * @returns {SignupStatus} Information on the status of the Signup
	 */
	getStatus () {
		logger.debug(`Status of credential signup ${this.id}: ${this.status}`);
		const ret = {
			status: this.status
		};
		if (this.error) {
			ret.error = this.error.code ? this.error.code : SIGNUP_ERRORS.SIGNUP_UNKNOWN_ERROR;
			ret.reason = this.error.message;
		}

		if (this.status === Signup.SIGNUP_STEPS.ESTABLISHING_CONNECTION && this.connection_offer)
			ret.connection_offer = this.connection_offer;

		// Just pass the ID until we know we need more.  Credential objects are large.
		if (this.status === Signup.SIGNUP_STEPS.ISSUING_CREDENTIAL && this.credential)
			ret.credential = {id: this.credential.id};

		// Just pass the ID until we know we need more.  Verification objects are large.
		if (this.status === Signup.SIGNUP_STEPS.CHECKING_CREDENTIAL && this.verification)
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

exports.SIGNUP_STEPS = Signup.SIGNUP_STEPS;

const SIGNUP_ERRORS = {
	SIGNUP_INVALID_ATTRIBUTES: 'CREDENTIAL_INVALID_USER_ATTRIBUTES',
	SIGNUP_NOT_A_US_RESIDENT: 'SIGNUP_NOT_A_US_RESIDENT',
	SIGNUP_PROOF_FAILED: 'SIGNUP_PROOF_FAILED',
	SCHEMA_LOOKUP_FAILED: 'SCHEMA_LOOKUP_FAILED',
	SIGNUP_HOLDER_AGENT_NOT_FOUND: 'SIGNUP_HOLDER_AGENT_NOT_FOUND',
	SIGNUP_VERIFICATION_REQUEST_NOT_FOUND: 'SIGNUP_VERIFICATION_REQUEST_NOT_FOUND',
	SIGNUP_UNKNOWN_ERROR: 'SIGNUP_UNKNOWN_ERROR',
	SIGNUP_NO_CREDENTIAL_DEFINITIONS: 'SIGNUP_NO_CREDENTIAL_DEFINITIONS',
	SIGNUP_CONNECTION_FAILED: 'SIGNUP_CONNECTION_FAILED'
};

exports.SIGNUP_ERRORS = SIGNUP_ERRORS;
