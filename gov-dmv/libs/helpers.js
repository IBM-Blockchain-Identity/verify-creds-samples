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

const path = require('path');
const fs = require('fs');
const uuidv4 = require('uuid/v4');
const async = require('async');

const Logger = require('./logger.js').Logger;
const logger = Logger.makeLogger(Logger.logPrefix(__filename));

/**
 * Provides functions that allow a developer to delegate responsibility for building proof requests and checking proof
 * responses for validity.
 *
 * @interface ProofHelper
 */

/**
 * Gets a proof schema object that can be used to create a proof schema on the agent
 * @async
 * @function
 * @name ProofHelper#getProofSchema
 * @param {object} [opts] Parameters that are relevant to the construction of the proof request.
 * @returns {Promise<object>} A promise that resolves with a proof schema.
 */

/**
 * Checks a proof response.  This might mean check the proof against whatever information is in the opts parameter.
 * @async
 * @function
 * @name ProofHelper#checkProof
 * @param {object} proof The proof response to check.
 * @param {object} [opts] Data to check the proof response against.
 * @returns {Promise<object>} A promise that resolves with the accepted proof or rejects if the proof was not accepted.
 */

/**
 * Allows developers to delegate responsibility for managing proof schemas, proof verification, and user record creation.
 *
 * @interface SignupHelper
 * @extends ProofHelper
 */

/**
 * @async
 * @function SignupHelper#proofToUserRecord
 * @param {object} verification An accepted verification.
 * @returns {Promise<object>} A promise that resolves with personal data for a user record extracted from the proof data.
 */

/**
 * Generates static proof requests for verifiable credential based logins.
 * @class
 * @implements {ProofHelper}
 */
class LoginHelper {

	/**
	 * Creates a LoginHelper that will serve proof requests based on the given file
	 * @param {string} proof_schema_file The path to a proof schema file
	 */
	constructor (proof_schema_file) {
		if (!proof_schema_file || typeof proof_schema_file !== 'string')
			throw new TypeError('Invalid path to proof schema file');

		// Make sure the proof schema is a json file
		const ext = path.extname(proof_schema_file).toLowerCase().substring(1); // Remove the period in the extension
		if (ext !== 'json')
			throw new Error (`File ${proof_schema_file} is not a json file!`);

		// Make sure the image exists
		if (!fs.existsSync(proof_schema_file))
			throw new Error(`File ${proof_schema_file} does not exist`);

		this.proof_schema_file = proof_schema_file;
		this.proof_schema_template = null;
	}

	async getProofSchema (opts) {

		// Get the schema if we don't already have it.
		if (!this.proof_schema_template) {
			logger.info(`Loading proof schema: ${this.proof_schema_file}`);
			const file_promise = new Promise(((resolve, reject) => {
				fs.readFile(this.proof_schema_file, (error, file) => {
					if (error) return reject(error);
					resolve(file);
				});
			}));
			const proof_schema = JSON.parse(await file_promise);
			if (!proof_schema.name || !proof_schema.version) throw new Error('Invalid proof schema');
			this.proof_schema_template = proof_schema;
		}

		// Keep the login proof schemas unique.
		const ret = JSON.parse(JSON.stringify(this.proof_schema_template)); // Copy
		ret.version = ret.version + Date.now();

		// Assign any restrictions to the proof request, if some were given.
		if (ret.requested_attributes && opts && opts.restrictions) {
			for (const key in ret.requested_attributes) {
				ret.requested_attributes[key].restrictions = opts.restrictions;
			}
		}
		return ret;
	}

	async checkProof (verification, user_record) {
		if (!verification || !verification.info || !verification.info.attributes)
			throw new TypeError('No attributes found in given Verification');
		if (!user_record || !user_record.personal_info)
			throw new TypeError('Invalid user record');

		// Get the schema if we don't already have it.
		if (!this.proof_schema_template) {
			logger.info(`Loading proof schema: ${this.proof_schema_file}`);
			const file_promise = new Promise(((resolve, reject) => {
				fs.readFile(this.proof_schema_file, (error, file) => {
					if (error) return reject(error);
					resolve(file);
				});
			}));
			const proof_schema = JSON.parse(await file_promise);
			if (!proof_schema.name || !proof_schema.version) throw new Error('Invalid proof schema');
			this.proof_schema_template = proof_schema;
		}

		logger.info('Checking the proof for the proper attributes');
		const attributes = verification['info']['attributes'];

		// Make sure the proof schema attributes are present
		for (const key in this.proof_schema_template.requested_attributes) {
			const schema_attr = this.proof_schema_template.requested_attributes[key];

			logger.debug(`Checking proof for schema attribute: ${schema_attr.name}`);
			let accepted_proof_attr;
			for (const proof_index in attributes) {
				const proof_attr = attributes[proof_index];

				// Indy removes spaces and capital letters in proof response attribute names for some reason
				if (!proof_attr.name || proof_attr.name !== schema_attr.name.toLowerCase().split(' ').join('')) continue;

				// Make sure the requested attributes that had restrictions have a credential associated with them
				if (schema_attr.restrictions && schema_attr.restrictions.length && !proof_attr.cred_def_id)
					throw new Error(`Requested attribute ${schema_attr.name} did not have an associated credential`);

				logger.debug(`Attribute ${schema_attr.name} was present in the proof and verified`);
				accepted_proof_attr = proof_attr;
			}

			if (!accepted_proof_attr || !accepted_proof_attr.name || user_record.personal_info[schema_attr.name] !== accepted_proof_attr.value)
				throw new Error(`Verified attribute ${JSON.stringify(schema_attr.name)} did not match the user record`);

			logger.debug(`Proof attribute ${accepted_proof_attr.name} matches the user record`);
		}
		logger.info('Verified all proof attributes from the proof');
		return true;
	}
}

/**
 * Returns a purely self attested proof schema and always returns true when checking a proof.
 * @class
 * @implements {ProofHelper}
 */
class NullProofHelper {

	/**
	 * @param {boolean} pass_proofs Null proof help will always pass proofs if this is True and fail them otherwise.
	 */
	constructor (pass_proofs) {
		this.pass_proofs = !! pass_proofs;
	}

	async getProofSchema () {
		return {
			name: 'Dummy Proof Request',
			version: '1.0' + Date.now(),
			requested_attributes: {
				dummy_attribute: {
					name: 'dummy_attribute'
				}
			}
		};
	}

	async checkProof () {
		if (this.pass_proofs)
			return this.pass_proofs;
		else
			throw new Error('Proof was not accepted');
	}
}


/**
 * A helper class to mitigate the amount of hardcoding in the signup.js library.  Facilitates using a drivers license
 * and employment credential to get a bank account.
 * @class
 * @implements {SignupHelper}
 */
class AccountSignupHelper {

	/**
	 * Creates a AccountSignupHelper that will create proof requests asking for a drivers license and employment badge.
	 * @param {Agent} agent An Agent instance capable of looking up schemas.
	 */
	constructor (agent) {
		this.agent = agent;
	}

	/**
	 * Cleans up all the connections created for this signup flow.  Handy for when you need to change the properties
	 * you want to set on the connections to the issuers.
	 * @returns {Promise<void>} A promise that resolves when the connections created for this flow are deleted.
	 */
	async cleanup () {
		logger.info(`Cleaning up connections to the issuers: ${this.dmv_invitation_url}`);
		const connections = await this.agent.getConnections();
		logger.info(`Cleaning up connections ${connections.length}`);
		for (const index in connections) {
			logger.debug(`Cleaning up connection ${connections[index].id}`);
			await this.agent.deleteConnection(connections[index].id);
		}
	}

}

class ConnectionResponder {
	constructor (agent, interval) {
		if (!agent || typeof agent.getConnections !== 'function')
			throw new TypeError('Invalid agent for ConnectionResponder');
		if (interval !== undefined && typeof interval !== 'number' || interval < 0)
			throw new TypeError('Invalid polling interval for ConnectionResponder');
		this.agent = agent;
		this.stopped = true;
		this.interval = interval !== undefined ? interval : 3000;
	}

	async start () {
		this.stopped = false;

		async.until(
			() => { return this.stopped; },
			async () => {

				try {

					const offers = await this.agent.getConnections({
						state: 'inbound_offer'
					});
					logger.info('Connection Offers: ' + offers.length);
					if (offers.length > 0) {
						const offer = offers[0];
						try {
							logger.info(`Accepting connection offer ${offer.id} from  ${offer.remote.name}`);
							const r = await this.agent.acceptConnection(offer.id);
							logger.info(`Accepted connection offer ${r.id} from ${r.remote.name}`);
						} catch (error) {
							logger.error(`Couldn't accept connection offer ${offer.id}. Error: ${error}`);
							logger.info(`Deleting bad connection offer ${offer.id}`);
							await this.agent.deleteConnection(offer.id);
						}
					}
				} catch (error) {
					logger.error(`Failed to respond to connection requests: ${error}`);
				}

				return new Promise((resolve, reject) => {
					setTimeout(resolve, this.interval);
				});
			},
			(error) => {
				logger.error(`Stopping connection responder: ${error}`);
				this.stopped = false;
			}
		);
	}

	set_interval (interval) {
		if (typeof interval !== 'number' || interval < 0)
			throw new TypeError('ConnectionResponder interval must be >= 0');
		this.interval = interval;
	}

	async stop () {
		this.stopped = true;
	}
}

module.exports = {
	LoginHelper,
	NullProofHelper,
	ConnectionResponder,
	AccountSignupHelper
};