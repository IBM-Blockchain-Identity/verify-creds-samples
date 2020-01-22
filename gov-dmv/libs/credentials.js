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
	 * @param {ConnectionMethod} connection_method The method for connecting to the user.
	 * @returns {string} A Issuance instance ID to be used to check the status of the Issuance later.
	 */
	create_issuance (user, connection_method) {
		if (!user || typeof user !== 'string')
			throw new TypeError('Invalid user was provided for issuing credentials');
		if (!connection_method || typeof connection_method !== 'string')
			throw new TypeError('Invalid connection method for issuing credentials');

		const issuance_id = uuidv4();
		logger.info(`Creating issuance ${issuance_id}`);
		this.issuances[issuance_id] = new Issuance(issuance_id, this.agent, user, this.user_records, this.card_renderer, this.connection_icon_provider, connection_method);
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
	 * @param {ConnectionMethod} connection_method The method for establishing the connection to the user
	 */
	constructor (id, agent, user, user_records, card_renderer, connection_icon_provider, connection_method) {
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
		this.connection_method = connection_method;
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
			const schema_id = my_credential_definitions[0].schema_id;
			logger.debug(`Issuing credential with schema ${schema_id}`);

			const schema = await this.agent.getCredentialSchema(schema_id);
			if (!schema) {
				const err = new Error('Failed to lookup the selected schema');
				err.code = CREDENTIAL_ERRORS.CREDENTIAL_SCHEMA_LOOKUP_FAILED;
				throw err;
			}

			logger.debug(`User record: ${JSON.stringify(user_doc)}`);
			const attributes = {};
			for (const index in schema.attr_names) {
				const attr_name = schema.attr_names[index];
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
			logger.info(`Connection to user via the ${this.connection_method} method`);
			const connection_opts = icon ? {icon: icon} : null;
			let connection;

			try {

				if (this.connection_method === 'in_band') {

					if (!user_doc.opts || !user_doc.opts.agent_name) {
						const err = new Error('User record does not have an associated agent name');
						err.code = CREDENTIAL_ERRORS.CREDENTIAL_USER_AGENT_NOT_FOUND;
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

				} else if (this.connection_method === 'qrcode') {

					const agent_info = await this.agent.getIdentity();
					if (!agent_info || !agent_info.iurl) {
						throw new Error("Cannot find our agent url");
					}
					// return the issuance object's id (this.id) as the id for
					//  the mock connection offer.  UI will add that to the qr code
					//  as meta data that we can then look for on new connections
					//  to know when the connection has been made between our agent
					//  and the user's agent.
					this.connection_offer = {
						id: this.id,
						local: {
							name: this.agent.name,
							iurl: agent_info.iurl
						}
					};
					logger.info(`Built connection information`);
					// using the issuance object's id (this.id) as the nonce we
					//  are looking for 
					const nonce_connection_offer = await this.waitForNonceConnectionOffer(this.id, 30, 3000);
					// once we have the offer, accept it since it matches the
					//  nonce that we are expecting
					connection = await this.agent.acceptConnection(nonce_connection_offer.id);

				} else {
					const error = new Error(`An invalid connection method was used: ${this.connection_method}`);
					logger.error(`Credential issuance could not proceed: ${error}`);
					error.code = CREDENTIAL_ERRORS.CREDENTIAL_INVALID_CONNECTION_METHOD;
					throw error;
				}

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

	/**
	 * Waits for a {@link Connection} to enter the 'connected' or 'rejected'.
	 * @param {string} nonce The connection nonce for a specific invitation.
	 * @param {number} [retries] The number of times we should check the status of the connection before giving up.
	 * @param {number} [retry_interval] The number of milliseconds to wait between each connection status check.
	 * @return {Promise<Connection>} The accepted {@link Connection}.
	 */
	async waitForNonceConnectionOffer(nonce, retries, retry_interval) {

		let attempts = 0;
		const retry_opts = {
			times: retries ? retries : 30,
			interval: retry_interval ? retry_interval : 3000,
			errorFilter: (error) => {
				// We should stop if the error was something besides still waiting for the connection.
				return error.toString().toLowerCase().indexOf('waiting') >= 0;
			}
		};

		const that = this;
		return new Promise((resolve, reject) => {
			async.retry(retry_opts, async () => {

				logger.debug(`Checking for connection nonce: ${nonce}. Attempt ${++attempts}/${retry_opts.times}`);

				const connection_array = await that.agent.getConnections({"remote.properties.meta.nonce": nonce});
				if (!connection_array || connection_array.length === 0) {
					throw new Error('Still waiting for connection offer from user');
				} else if (connection_array.length === 1) {
					const connection_offer = connection_array[0];
					if ([ 'inbound_offer' ].indexOf(connection_offer.state) >= 0) {
						return connection_offer;
					}
				} else {
					throw new Error(`Failed, found more than one connection offer for nonce: ${nonce}`);
				}
			}, (error, inbound_connection_offer) => {
				if (error) {
					logger.error(`Failed to establish connection with nonce: ${nonce}: ${error}`);
					return reject(new Error(`Connection nonce: ${nonce} failed: ${error}`));
				}

				logger.info(`Connection with nonce: ${nonce} successfully established with agent ${inbound_connection_offer.remote.pairwise.did}`);
				resolve (inbound_connection_offer);
			});
		});
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
	return semverCompare(a.schema_version, b.schema_version);
}

exports.ISSUANCE_STEPS = Issuance.ISSUANCE_STEPS;

const CREDENTIAL_ERRORS = {
	CREDENTIAL_INVALID_USER_ATTRIBUTES: 'CREDENTIAL_INVALID_USER_ATTRIBUTES',
	CREDENTIAL_OFFER_FAILED: 'CREDENTIAL_OFFER_FAILED',
	CREDENTIAL_NOT_ACCEPTED: 'CREDENTIAL_NOT_ACCEPTED',
	CREDENTIAL_NO_CREDENTIAL_DEFINITIONS: 'CREDENTIAL_NO_CREDENTIAL_DEFINITIONS',
	CREDENTIAL_CONNECTION_FAILED: 'CREDENTIAL_CONNECTION_FAILED',
	CREDENTIAL_INVALID_CONNECTION_METHOD: 'CREDENTIAL_INVALID_CONNECTION_METHOD',
	CREDENTIAL_USER_AGENT_NOT_FOUND: 'CREDENTIAL_USER_AGENT_NOT_FOUND',
	CREDENTIAL_UNKNOWN_ERROR: 'CREDENTIAL_UNKNOWN_ERROR',
	CREDENTIAL_SCHEMA_LOOKUP_FAILED: 'CREDENTIAL_SCHEMA_LOOKUP_FAILED'
};

exports.CREDENTIAL_ERRORS = CREDENTIAL_ERRORS;
