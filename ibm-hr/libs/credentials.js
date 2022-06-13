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
const { v4: uuidv4 } = require('uuid');
const semverCompare = require('semver-compare');

const Logger = require('./logger.js').Logger;
const logger = Logger.makeLogger(Logger.logPrefix(__filename));

/**
 * Tracks and manages all the issuance flows.  Should clean up old issuance flows
 */
class IssuanceManager {

	/**
	 * @param {Agent} agent An agent for connecting to users and issuing credentials.
	 * @param {Users} user_records A Users instance with access to personal data for creating credentials.
	 * @param {CardRenderer} card_renderer The renderer for the credentials.
	 * @param {ImageProvider} connection_icon_provider Provides the image data for connection offers.
	 */
	constructor (agent, user_records, card_renderer, connection_icon_provider) {
		if (!agent || typeof agent.offerCredential !== 'function')
			throw new TypeError('IssuanceManager was not given an Agent instance');
		if (!user_records || typeof user_records.read_user !== 'function')
			throw new TypeError('IssuanceManager was not given a Users instance');
		if (!card_renderer || typeof card_renderer.createCardFront !== 'function')
			throw new TypeError('IssuanceManager was not given a CardRenderer instance');
		if (!connection_icon_provider || typeof connection_icon_provider.getImage !== 'function')
			throw new TypeError('IssuanceManager was not given an ImageProvider instance');

		this.agent = agent;
		this.user_records = user_records;
		this.issuances = {};
		this.card_renderer = card_renderer;
		this.connection_icon_provider = connection_icon_provider;
	}

	/**
	 * Creates an Issuance for the given user.
	 * @param {string} user The app user we want to deliver a credential to.
	 * @returns {string} A Issuance instance ID to be used to check the status of the Issuance later.
	 */
	create_issuance (user) {
		if (!user || typeof user !== 'string')
			throw new TypeError('Invalid user was provided for issuing credentials');

		const issuance_id = uuidv4();
		logger.info(`Creating issuance ${issuance_id}`);
		this.issuances[issuance_id] = new Issuance(issuance_id, this.agent, user, this.user_records, this.card_renderer, this.connection_icon_provider);
		this.issuances[issuance_id].start();
		return issuance_id;
	}

	/**
	 * Gets the status of a given Issuance.
	 * @param {string} issuance_id The ID of the Issuance to check.
	 * @returns {IssuanceStatus} The status of the given Issuance.
	 */
	get_issuance_status (issuance_id) {
		if (!issuance_id || typeof issuance_id !== 'string')
			throw new TypeError('Invalid issuance ID was provided to issuance manager');

		if (!this.issuances[issuance_id]) {
			const error = new Error(`Issuance ${issuance_id} was not found in issuance list`);
			error.code = ISSUANCE_MANAGER_ERRORS.ISSUANCE_NOT_FOUND;
			throw error;
		}

		return this.issuances[issuance_id].getStatus();
	}

	/**
	 * Stops the given Issuance and deletes it from the issuance list.
	 *
	 * @param {string} issuance_id The ID of a running Issuance.
	 * @returns {void}
	 */
	delete_issuance (issuance_id) {
		if (!issuance_id || typeof issuance_id !== 'string')
			throw new TypeError('Invalid issuance ID was provided to issuance manager');

		if (!this.issuances[issuance_id]) {
			const error = new Error(`Issuance ${issuance_id} was not found in issuance list`);
			error.code = ISSUANCE_MANAGER_ERRORS.ISSUANCE_NOT_FOUND;
			throw error;
		}
		const issuance = this.issuances[issuance_id];

		if ([
			Issuance.ISSUANCE_STEPS.FINISHED,
			Issuance.ISSUANCE_STEPS.ERROR,
			Issuance.ISSUANCE_STEPS.STOPPED
		].indexOf(issuance.getStatus().status) >= 0) {
			const error = new Error(`Issuance ${issuance_id} is already stopped`);
			error.code = ISSUANCE_MANAGER_ERRORS.ISSUANCE_ALREADY_STOPPED;
			throw error;
		}

		issuance.stop();
		delete this.issuances[issuance_id];
	}
}
exports.IssuanceManager = IssuanceManager;

const ISSUANCE_MANAGER_ERRORS = {
	ISSUANCE_NOT_FOUND: 'ISSUANCE_NOT_FOUND',
	ISSUANCE_ALREADY_STOPPED: 'ISSUANCE_ALREADY_STOPPED'
};
exports.ISSUANCE_MANAGER_ERRORS = ISSUANCE_MANAGER_ERRORS;

/**
 * Connects and issues a credential to a given agent name.  Because this is a potentially long-running process,
 * this class has methods to start, stop, and check the status of the flow.  This allows the UI to be able to keep track
 * of where the flow is and update the user accordingly.
 */
class Issuance {

	/**
	 * @enum {string}
	 * @returns {{CREATED: string, BUILDING_CREDENTIAL: string, ESTABLISHING_CONNECTION: string, ISSUING_CREDENTIAL: string, FINISHED: string, STOPPED: string, ERROR: string}} The possible states
	 * @constructor
	 */
	static get ISSUANCE_STEPS () {
		return {
			CREATED: 'CREATED',
			BUILDING_CREDENTIAL: 'BUILDING_CREDENTIAL',
			ESTABLISHING_CONNECTION: 'ESTABLISHING_CONNECTION',
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
	 * @param {string} id The ID for looking up this Issuance instance.
	 * @param {Agent} agent An agent to connect to users and send credential offers.
	 * @param {string} user The user to connect with.
	 * @param {Users} user_records The database of app Users where personal information is stored.
	 * @param {CardRenderer} card_renderer The handler for creating credential images from user data.
	 * @param {ImageProvider} connection_icon_provider Provides the image data for connection offers.
	 */
	constructor (id, agent, user, user_records, card_renderer, connection_icon_provider) {
		this.id = id;
		this.agent = agent;
		this.user = user;
		this.agent_name = null; // acquired from the user records.
		this.user_records = user_records;
		this.status = Issuance.ISSUANCE_STEPS.CREATED;
		this.card_renderer = card_renderer;
		this.error = null;
		this.connection_icon_provider = connection_icon_provider;
		this.connection_offer = null;
		this.credential = null;
	}

	/**
	 * Starts the Issuance and begins delivering a credential to the user.
	 * @returns {Promise<void>} Resolves when the issuance has finished, been stopped, or had an error.
	 */
	async start () {
		// Get icon to use for connection and credential
		const icon = await this.connection_icon_provider.getImage();

		try {

			logger.info(`Starting credential issuance flow ${this.id}`);

			this.status = Issuance.ISSUANCE_STEPS.BUILDING_CREDENTIAL;

			logger.info(`Getting credential data for ${this.user}`);
			const user_doc = await this.user_records.read_user(this.user);



			const my_credential_definitions = await this.agent.getCredentialDefinitions();
			logger.debug(`${this.agent.user}'s list of credential definitions: ${JSON.stringify(my_credential_definitions, 0, 1)}`);

			if (!my_credential_definitions.length) {
				const err = new Error(`No credential definitions were found for issuer ${this.agent.user}!`);
				err.code = CREDENTIAL_ERRORS.CREDENTIAL_NO_CREDENTIAL_DEFINITIONS;
				throw err;
			}

			my_credential_definitions.sort(sortSchemas).reverse();
			const schema_id = my_credential_definitions[0].schema.id;
			logger.debug(`Issuing credential with schema ${schema_id}`);

			const schema = await this.agent.getCredentialSchema(schema_id);
			if (!schema) {
				const err = new Error('Failed to lookup the selected schema');
				err.code = CREDENTIAL_ERRORS.CREDENTIAL_SCHEMA_LOOKUP_FAILED;
				throw err;
			}

			logger.debug(`User record: ${JSON.stringify(user_doc)}`);
			const attributes = {};
			for (const index in schema.attrs) {
				const attr_name = schema.attrs[index];
				// Certain attributes are supposed to contain rendered images of the credential
				if (attr_name === 'card_front') {
					attributes[attr_name] = await this.card_renderer.createCardFront(user_doc.personal_info);
				} else if (attr_name === 'card_back') {
					attributes[attr_name] = await this.card_renderer.createCardBack(user_doc.personal_info);
				} else {

					// Make sure the user has data for this attribute
					if (!user_doc.personal_info || [ 'string', 'number' ].indexOf(typeof user_doc.personal_info[attr_name]) < 0) {
						const err = new Error(`User record was missing data '${attr_name}', which is required for creating a credential`);
						err.code = CREDENTIAL_ERRORS.CREDENTIAL_INVALID_USER_ATTRIBUTES;
						throw err;
					}
					if (typeof user_doc.personal_info[attr_name] === 'number')
						attributes[attr_name] = '' + user_doc.personal_info[attr_name];
					else
						attributes[attr_name] = user_doc.personal_info[attr_name];
				}
			}

			this.status = Issuance.ISSUANCE_STEPS.ESTABLISHING_CONNECTION;
			const connection_opts = icon ? {icon: icon} : null;
			let connection;

			try {
				if (!user_doc.opts || !user_doc.opts.invitation_url) {
					const err = new Error('User record does not have an associated invitation url');
					err.code = CREDENTIAL_ERRORS.CREDENTIAL_USER_AGENT_NOT_FOUND;
					throw err;
				}

				logger.info(`Accepting invitation from ${this.user}`);
				this.connection_offer = await this.agent.acceptInvitation(user_doc.opts.invitation_url, connection_opts);
				if (!this.connection_offer || (this.connection_offer.state !== 'outbound_offer' && this.connection_offer.state !== 'connected')) {
					throw new Error('Connection in unexpected state after accepting invitation');
				}
				logger.info(`Sent connection offer ${this.connection_offer.id} to ${user_doc.opts.agent_name}`);
				connection = await this.agent.waitForConnection(this.connection_offer.id, 30, 3000);

			} catch (error) {
				logger.error(`Failed to establish a connection with the user. error: ${error}`);
				error.code = error.code ? error.code : CREDENTIAL_ERRORS.CREDENTIAL_CONNECTION_FAILED;
				if (this.connection_offer && this.connection_offer.id) {
					logger.info(`Cleaning up connection offer ${this.connection_offer.id}`);
					await this.agent.deleteConnection(this.connection_offer.id);
				}
				throw error;
			}
			logger.info(`Established connection ${connection.id}.  Their DID: ${connection.remote.pairwise.did}`);

			this.status = Issuance.ISSUANCE_STEPS.ISSUING_CREDENTIAL;

			logger.info(`Sending credential offer to ${connection.remote.pairwise.did}`);
			try {
				this.credential = await this.agent.offerCredential({
					did: connection.remote.pairwise.did
				}, {
					schema_name: schema.name,
					schema_version: schema.version
				}, attributes, {
					icon: icon
				});
			} catch (error) {
				logger.error(`Failed to offer credential. Deleting connection ${connection.id}. error: ${error}`);
				error.code = error.code ? error.code : CREDENTIAL_ERRORS.CREDENTIAL_CONNECTION_FAILED;
				await this.agent.deleteConnection(connection.id);
				throw error;
			}

			logger.info(`Waiting for credential offer acceptance for credential ${this.credential.id}`);
			let finished_credential;
			try {
				finished_credential = await this.agent.waitForCredential(this.credential.id, 30, 3000);
			} catch (error) {
				logger.error(`Failed to deliver credential ${this.credential.id}.  Deleting credential. error: ${error}`);
				error.code = error.code ? error.code : CREDENTIAL_ERRORS.CREDENTIAL_OFFER_FAILED;
				await this.agent.deleteCredential(this.credential.id);
				throw error;
			}

			logger.info(`Final state for credential ${finished_credential.id}: ${finished_credential.state}`);
			if (finished_credential.state === 'issued') {
				logger.info(`Issued credential ${finished_credential.id} to ${connection.remote.pairwise.did}`);
				this.status = Issuance.ISSUANCE_STEPS.FINISHED;
			} else {
				const error = new Error(`Offered credential ${finished_credential.id} was not accepted by ${connection.remote.pairwise.did}. Deleting credential.`);
				error.code = CREDENTIAL_ERRORS.CREDENTIAL_NOT_ACCEPTED;
				logger.error(error.message);
				await this.agent.deleteCredential(finished_credential.id);
				throw error;
			}

		} catch (error) {
			logger.error(`Issuance failed: ${error}`);
			this.status = Issuance.ISSUANCE_STEPS.ERROR;
			this.error = error;
		}
	}

	/**
	 * Stops this Issuance, meaning that the Issuance will still finish whatever the current issuance task is, such as
	 * issuing a credential offer, but will cease activity before the next task.
	 * @returns {void}
	 */
	stop () {
		logger.info(`Stopping credential issuance flow ${this.id}`);
		this.status = Issuance.ISSUANCE_STEPS.STOPPED;
	}

	/**
	 * @typedef {object} IssuanceStatus
	 * @property {ISSUANCE_STEPS} status The status of the Issuance.
	 * @property {error} [error] An error code, only present if the status is ERROR.
	 * @property {string} [reason] A description of the error code.  Only present if the status is ERROR.
	 * @property {object} [connection_offer] A connection offer.  Only present if the status is ESTABLISHING_CONNECTION.
	 * @property {string} [credential] A credential offer ID. Only present if the status is ISSUING_CREDENTIAL.
	 */

	/**
	 * Gets the status of the Issuance.
	 * @returns {IssuanceStatus} Information on the status of the issuance
	 */
	getStatus () {
		logger.debug(`Status of credential issuance ${this.id}: ${this.status}`);
		const ret = {
			status: this.status
		};

		if (this.error) {
			ret.error = this.error.code ? this.error.code : CREDENTIAL_ERRORS.CREDENTIAL_UNKNOWN_ERROR;
			ret.reason = this.error.message;
		}

		if (this.status === Issuance.ISSUANCE_STEPS.ESTABLISHING_CONNECTION && this.connection_offer)
			ret.connection_offer = this.connection_offer;

		// Just pass the ID until we know we need more.  Credential objects are large.
		if (this.status === Issuance.ISSUANCE_STEPS.ISSUING_CREDENTIAL && this.credential)
			ret.credential = {
				id: this.credential.id
			};

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

exports.ISSUANCE_STEPS = Issuance.ISSUANCE_STEPS;

const CREDENTIAL_ERRORS = {
	CREDENTIAL_INVALID_USER_ATTRIBUTES: 'CREDENTIAL_INVALID_USER_ATTRIBUTES',
	CREDENTIAL_OFFER_FAILED: 'CREDENTIAL_OFFER_FAILED',
	CREDENTIAL_NOT_ACCEPTED: 'CREDENTIAL_NOT_ACCEPTED',
	CREDENTIAL_NO_CREDENTIAL_DEFINITIONS: 'CREDENTIAL_NO_CREDENTIAL_DEFINITIONS',
	CREDENTIAL_CONNECTION_FAILED: 'CREDENTIAL_CONNECTION_FAILED',
	CREDENTIAL_USER_AGENT_NOT_FOUND: 'CREDENTIAL_USER_AGENT_NOT_FOUND',
	CREDENTIAL_UNKNOWN_ERROR: 'CREDENTIAL_UNKNOWN_ERROR',
	CREDENTIAL_SCHEMA_LOOKUP_FAILED: 'CREDENTIAL_SCHEMA_LOOKUP_FAILED'
};

exports.CREDENTIAL_ERRORS = CREDENTIAL_ERRORS;
