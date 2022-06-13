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

const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
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
	 * @param {string} hr_issuer_did The agent DID for the HR issuer.
	 * @param {string} dmv_issuer_did The agent DID for the dmv issuer.
	 * @param {string} proof_schema_path The path to a proof schema file.
	 * @param {Agent} agent An Agent instance capable of looking up schemas.
	 */
	constructor (hr_issuer_did, dmv_issuer_did, proof_schema_path, agent) {
		if (!hr_issuer_did || typeof hr_issuer_did !== 'string')
			throw new TypeError('Invalid HR issuer');
		if (!dmv_issuer_did || typeof dmv_issuer_did !== 'string')
			throw new TypeError('Invalid DMV issuer');
		if (!proof_schema_path || typeof proof_schema_path !== 'string')
			throw new TypeError('Invalid proof schema path for signup helper');
		if (!agent || typeof agent.getCredentialDefinitions !== 'function')
			throw new TypeError('Invalid agent');

		// Make sure the proof schema is a json file
		const ext = path.extname(proof_schema_path).toLowerCase().substring(1); // Remove the period in the extension
		if (ext !== 'json')
			throw new Error (`File ${proof_schema_path} is not a json file!`);

		// Make sure the image exists
		if (!fs.existsSync(proof_schema_path))
			throw new Error(`File ${proof_schema_path} does not exist`);

		this.hr_issuer_did = hr_issuer_did;
		this.dmv_issuer_did = dmv_issuer_did;
		this.proof_schema_path = proof_schema_path;
		this.agent = agent;
	}

	async getProofSchema (opts) {
		const PROOF_FORMAT = await new Promise((resolve, reject) => {
			logger.info(`Loading proof schema: ${this.proof_schema_path}`);
			fs.readFile(this.proof_schema_path, (error, file) => {
				if (error) return reject(error);
				file = JSON.parse(file);
				if (!file.name || !file.version)
					return reject(new Error('Invalid proof schema'));
				resolve(file);
			});
		});

		logger.info(`Looking up credential definitions for issuer ${this.dmv_issuer_did}`);
		const dmv_cred_defs = await this.agent.getCredentialDefinitions(true, {owner_did: this.dmv_issuer_did});
		logger.debug(`${this.dmv_issuer_did}'s credential definitions: ${JSON.stringify(dmv_cred_defs, 0, 1)}`);
		const dmv_restrictions = [];
		for (const cred_def_index in dmv_cred_defs) {
			const cred_def = dmv_cred_defs[cred_def_index];
			dmv_restrictions.push({cred_def_id: cred_def.id});
		}

		logger.info(`Looking up credential definitions for issuer ${this.hr_issuer_did}`);
		const hr_cred_defs = await this.agent.getCredentialDefinitions(true, {owner_did: this.hr_issuer_did});
		logger.debug(`${this.hr_issuer_did}'s credential definitions: ${JSON.stringify(hr_cred_defs, 0, 1)}`);
		const hr_restrictions = [];
		for (const cred_def_index in hr_cred_defs) {
			const cred_def = hr_cred_defs[cred_def_index];
			hr_restrictions.push({cred_def_id: cred_def.id});
		}

		const proof_request = {
			'name': PROOF_FORMAT.name,
			'version': PROOF_FORMAT.version + Date.now(),
			'requested_attributes': {}
		};
		for (const key in PROOF_FORMAT.requested_attributes) {
			const attribute = PROOF_FORMAT.requested_attributes[key].name;

			let restrictions = [];
			if (key.toLowerCase().indexOf('mdl') >= 0) {
				restrictions = dmv_restrictions;
			} else if (key.toLowerCase().indexOf('hr') >= 0) {
				restrictions = hr_restrictions;
			}
			proof_request.requested_attributes[attribute] = {
				name: attribute,
				restrictions: restrictions
			};
		}
		return proof_request;
	}

	async checkProof (verification, opts) {
		if (!verification || !verification.id || !verification.info || !verification.info.attributes)
			throw new TypeError('Invalid verification');

		logger.debug(`Displaying proof values for verification ${verification.id}:`);
		const proof_attributes = verification.info.attributes;
		const attributes = {};
		for (const i in proof_attributes) {
			const attr = proof_attributes[i];
			if (attr.cred_def_id)
				attributes[attr.name] = attr.value;

			logger.debug(`  ${attr['cred_def_id'] ? '*' : ' '}${attr.name} = ${attr.value}`);
		}
		logger.debug('(*Verified values from credential)');

		// Make sure the fields we need were provided
		// Comment out the remainder because the info.attributes are now equal to the schema attributes
                /*
		if (!attributes.first_name || !attributes.firstname) // 'First Name' is converted to 'firstname' in Hyperledger Indy
			throw new Error('Two verified attestations of first name were not provided');

		if (!attributes.last_name || !attributes.lastname)
			throw new Error('Two verified attestations of last name were not provided');

		if (!attributes.address_line_1 || !attributes.state || !attributes.zip_code || !attributes.country)
			throw new Error('A verified attestation of address was not provided');

		if (!attributes.socialsecuritynumber)
			throw new Error('A verified attestation of a social security number was not provided');

		if (!attributes.dob)
			throw new Error('A verified attestation of date of birth was not provided');

		// Make sure matchable attributes match
		if (attributes.first_name.toLowerCase().trim() !== attributes.firstname.toLowerCase().trim())
			throw new Error('Provided first names did not match');

		if (attributes.last_name.toLowerCase().trim() !== attributes.lastname.toLowerCase().trim())
			throw new Error('Provided last names did not match');

		// Make sure the user didn't try to sign up from the wrong country
		if (!attributes.country || [ 'united states', 'us' ].indexOf(attributes.country.toLowerCase().trim()) < 0)
			throw new Error(`Account signups from country ${attributes.country} are not permitted`);
                */

		return verification;
	}

	async proofToUserRecord (verification) {
		if (!verification || !verification.id || !verification.info || !verification.info.attributes)
			throw new TypeError('Invalid verification');

		const proof_attributes = verification.info.attributes;
		const attributes = {};
		for (const i in proof_attributes) {
			const attr = proof_attributes[i];
			attributes[attr.name] = attr.value;
		}

		// Process the date of birth into a timestamp to support predicate requests
		let dob_timestamp = 1000000;
		const msInDay = 1000*60*60*24;
		try {
			dob_timestamp = (new Date(attributes.dob)).getTime()/msInDay;
			logger.info('dob_timestamp='+dob_timestamp);
		} catch (e) {
			logger.info('Error setting dob_timestamp: ' + JSON.stringify(e));
			throw new Error('An invalid attestation of date of birth was provided');
		}

		return {
			first_name: attributes.first_name,
			middle_name: attributes.middle_name ? attributes.middle_name : '_',
			last_name: attributes.last_name,
			dob: attributes.dob,
			dob_timestamp: dob_timestamp,
			address_line_1: attributes.address_line_1,
			address_line_2: attributes.address_line_2 ? attributes.address_line_2 : '_',
			ssn: attributes["Social Security Number"],
			state: attributes.state,
			postal_code: attributes.zip_code,
			institution_number: 'bbcu123',
			transit_number: uuidv4(),
			account_number: uuidv4()
		};
	}
}

/**
 * Waits for a request type (Connection, Credential, Verification) to be pending for
 *  the web apps's associated agent.
 * @param {string} agent The agent who is receiving the inbound offer/request.
 * @param {string} type The type of request.
 * @param {string} nonce The connection ID.
 * @param {number} [retries] The number of times we should check the status of the connection before giving up.
 * @param {number} [retry_interval] The number of milliseconds to wait between each connection status check.
 * @return {Promise<object>} The found request.
 */
class InboundNonceWatcher {

	constructor (agent, type, nonce, retries=30, interval=3000) {
		if (!agent || typeof agent.getConnections !== 'function')
			throw new TypeError('Invalid agent for InboundWatcher');
		if (interval !== undefined && typeof interval !== 'number' || interval < 0)
			throw new TypeError('Invalid polling interval for InboundNonceWatcher');
		if (retries !== undefined && typeof retries !== 'number' || retries < 0)
			throw new TypeError('Invalid polling interval for InboundNonceWatcher');
		if (nonce !== undefined && typeof nonce !== 'string' || nonce.length === 0)
			throw new TypeError('Invalid nonce for InboundNonceWatcher');
		this.agent = agent;
		this.type = type;
		this.nonce = nonce;
		this.stopped = true;
		this.retries = retries;
		this.interval = interval;
	}

	async start () {
		this.stopped = false;

		let attempts = 0;
		let step_number = 1;
		const qr_code_nonce = this.nonce;
		const type = this.type;
		const retry_opts = {
			times: this.retries ? this.retries : 30,
			interval: this.interval ? this.interval : 3000,
			errorFilter: (error) => {
				// We should stop if the error was something besides still waiting for the request.
				return error.toString().toLowerCase().indexOf('waiting') >= 0;
			}
		};

		return new Promise((resolve, reject) => {
			async.retry(retry_opts, async () => {

				logger.debug(`Checking status of request, type: ${InboundNonceWatcher.REQUEST_TYPES_KEYS_AS_STRINGS[step_number]}, nonce: ${qr_code_nonce}, step_number ${step_number}. Attempt ${++attempts}/${retry_opts.times}`);
				let queryObj = {};
				let updated_request = null;
				if (type & InboundNonceWatcher.REQUEST_TYPES.CONNECTION) {
					queryObj['remote.properties.meta.nonce'] = qr_code_nonce;
					updated_request = await this.agent.getConnections(queryObj);
					if (updated_request.hasOwnProperty('length') && updated_request.length > 0
						&& ['connected'].indexOf(updated_request[0].state) >= 0) {
						step_number = 4;
					}
				}
				if ((!updated_request || (updated_request.hasOwnProperty('length') && updated_request.length === 0)) && (type & InboundNonceWatcher.REQUEST_TYPES.VERIFICATION)) {
					queryObj = {};
					queryObj['properties.meta.nonce'] = qr_code_nonce;
					updated_request = await this.agent.getVerifications(queryObj);
				}
				if (!updated_request || (updated_request.length > 0 && !updated_request[0].state)) {
					throw new Error(`${InboundNonceWatcher.REQUEST_TYPES_KEYS_AS_STRINGS[step_number]} state could not be determined`);
				} else if (updated_request.length > 0) {
					if ((type & InboundNonceWatcher.REQUEST_TYPES.CONNECTION && [ 'connected' ].indexOf(updated_request[0].state) >= 0) ||
						(type & InboundNonceWatcher.REQUEST_TYPES.VERIFICATION && [ 'inbound_verification_request' ].indexOf(updated_request[0].state) >= 0)) {
						return updated_request[0];
					} else {
						throw new Error(`${InboundNonceWatcher.REQUEST_TYPES_KEYS_AS_STRINGS[step_number]} with nonce ${qr_code_nonce} is in an unexpected state`);
					}
				} else {
					throw new Error(`Still waiting on ${InboundNonceWatcher.REQUEST_TYPES_KEYS_AS_STRINGS[step_number]} to be complete`);
				}
			}, (error, found_request) => {
				if (error) {
					logger.error(`Failed to establish ${InboundNonceWatcher.REQUEST_TYPES_KEYS_AS_STRINGS[step_number]} with nonce ${qr_code_nonce}: ${error}`);
					return reject(new Error(`${InboundNonceWatcher.REQUEST_TYPES_KEYS_AS_STRINGS[step_number]} with nonce ${qr_code_nonce} failed: ${error}`));
				}

				let agent_did = null;
				if (found_request.remote) {
					agent_did = found_request.remote.pairwise.did;
				} else if (found_request.connection && found_request.connection.remote) {
					agent_did = found_request.connection.remote.pairwise.did;
				}
				logger.info(`${InboundNonceWatcher.REQUEST_TYPES_KEYS_AS_STRINGS[step_number]} with nonce ${qr_code_nonce} successfully established with agent ${agent_did}`);
				resolve (found_request);
			});
		});
	}

	set_interval (interval) {
		if (typeof interval !== 'number' || interval < 0)
			throw new TypeError('InboundNonceWatcher interval must be >= 0');
		this.interval = interval;
	}

	async stop () {
		this.stopped = true;
	}
}

InboundNonceWatcher.REQUEST_TYPES = {
	CONNECTION: 1,
	CREDENTIAL: 2,
	VERIFICATION: 4,
};

InboundNonceWatcher.REQUEST_TYPES_KEYS_AS_STRINGS = {
	[InboundNonceWatcher.REQUEST_TYPES.CONNECTION]: "CONNECTION",
	[InboundNonceWatcher.REQUEST_TYPES.CREDENTIAL]: "CREDENTIAL",
	[InboundNonceWatcher.REQUEST_TYPES.VERIFICATION]: "VERIFICATION",
}

module.exports = {
	LoginHelper,
	NullProofHelper,
	AccountSignupHelper,
	InboundNonceWatcher,
};
