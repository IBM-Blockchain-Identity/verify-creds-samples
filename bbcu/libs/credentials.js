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

			if (!user_doc.opts || !user_doc.opts.agent_name) {
				const err = new Error('User record does not have an associated agent name');
				err.code = CREDENTIAL_ERRORS.INVALID_ATTRIBUTES;
				throw err;
			}

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
				err.code = CREDENTIAL_ERRORS.CREDENTIAL_CREATION_FAILED;
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
						err.code = CREDENTIAL_ERRORS.INVALID_ATTRIBUTES;
						throw err;
					}
					if (typeof user_doc.personal_info[attr_name] === 'number')
						attributes[attr_name] = '' + user_doc.personal_info[attr_name];
					else
						attributes[attr_name] = user_doc.personal_info[attr_name];
				}
			}

			this.status = Issuance.ISSUANCE_STEPS.ESTABLISHING_CONNECTION;

			let connection_to = user_doc.opts.agent_name;
			if (typeof connection_to === 'string') {
				if (connection_to.toLowerCase().indexOf('http') >= 0)
					connection_to = {url: connection_to};
				else
					connection_to = {name: connection_to};
			}
			logger.info(`Making sure we have a connection to ${JSON.stringify(connection_to)}`);
			this.connection_offer = await this.agent.createConnection(connection_to, {
				icon: icon
			});

			let connection;
			try {
				connection = await this.agent.waitForConnection(this.connection_offer.id, 30, 3000);

			} catch (error) {
				logger.error(`Failed to establish connection offer ${this.connection_offer.id}.  Deleting connection.  error: ${error}`);
				await this.agent.deleteConnection(this.connection_offer.id);
				throw error;
			}
			logger.info(`Established connection ${connection.id} to ${JSON.stringify(connection_to)}.  Their DID: ${connection.remote.pairwise.did}`);

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
				await this.agent.deleteConnection(connection.id);
				throw error;
			}

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
				this.status = Issuance.ISSUANCE_STEPS.FINISHED;
			} else {
				const error = new Error(`Offered credential ${finished_credential.id} was not accepted by ${connection.remote.pairwise.did}. Deleting credential.`);
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
	 * @property {error} [error] The error that occurred, if the issuance status is ERROR.
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
		if (this.error)
			ret.error = this.error;

		if (this.status === Issuance.ISSUANCE_STEPS.ESTABLISHING_CONNECTION && this.connection_offer)
			ret.connection_offer = this.connection_offer;

		// Just pass the ID until we know we need more.  Credential objects are large.
		if (this.status === Issuance.ISSUANCE_STEPS.ISSUING_CREDENTIAL && this.credential)
			ret.credential = {id: this.credential.id};

		return ret;
	}
}

/**
 * Sorts schema objects from the cloud agent API based on their schema number, which seems to match the order in which
 * they were published.
 * @param {object} a A schema object.
 * @param {object} b A schema object.
 * @return {number} <0 if a come before b, 0 if they are the same, >0 if b comes before a
 */
function sortSchemas (a, b) {
	const aData = parseInt(JSON.parse(a.data).schemaId, 10);
	const bData = parseInt(JSON.parse(b.data).schemaId, 10);
	return aData - bData;
}

exports.ISSUANCE_STEPS = Issuance.ISSUANCE_STEPS;

const CREDENTIAL_ERRORS = {
	INVALID_ATTRIBUTES: 'INVALID_ATTRIBUTES',
	CREDENTIAL_DESIGN_DOC_PUBLISHING_FAILED: 'CREDENTIAL_DESIGN_DOC_PUBLISHING_FAILED',
	CREDENTIAL_CREATION_FAILED: 'CREDENTIAL_CREATION_FAILED',
	CREDENTIAL_READ_FAILED: 'CREDENTIAL_READ_FAILED',
	CREDENTIAL_OFFER_FAILED: 'CREDENTIAL_OFFER_FAILED',
	CREDENTIAL_NOT_FOUND: 'CREDENTIAL_NOT_FOUND',
	CREDENTIAL_NOT_OFFERED_YET: 'CREDENTIAL_NOT_OFFERED_YET',
	CREDENTIAL_NOT_ACCEPTED_YET: 'CREDENTIAL_NOT_ACCEPTED_YET',
	CREDENTIAL_SEND_FAILED: 'CREDENTIAL_SEND_FAILED',
	CREDENTIAL_DELETE_FAILED: 'CREDENTIAL_DELETE_FAILED',
	CREDENTIAL_UPDATE_FAILED: 'CREDENTIAL_UPDATE_FAILED',
	CREDENTIAL_NO_CREDENTIAL_DEFINITIONS: 'CREDENTIAL_NO_CREDENTIAL_DEFINITIONS'
};

exports.CREDENTIAL_ERRORS = CREDENTIAL_ERRORS;