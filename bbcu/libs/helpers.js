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
	 * @param {string} hr_issuer The agent name for the HR issuer.
	 * @param {string} dmv_issuer The agent name for the dmv issuer.
	 * @param {string} proof_schema_path The path to a proof schema file.
	 * @param {Agent} agent An Agent instance capable of looking up schemas.
	 */
	constructor (hr_issuer, dmv_issuer, proof_schema_path, agent) {
		if (!hr_issuer || typeof hr_issuer !== 'string')
			throw new TypeError('Invalid HR issuer');
		if (!dmv_issuer || typeof dmv_issuer !== 'string')
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

		this.hr_issuer = hr_issuer;
		this.dmv_issuer = dmv_issuer;
		this.proof_schema_path = proof_schema_path;
		this.agent = agent;
	}

	/**
	 * Sets up tagged connections to the DMV and HR apps so that we can use the `/credential_definitions?route=trustedDMV:true`
	 * or `/credential_definitions?route=trustedDMV:true` API calls to get their credential definition list later.
	 * @returns {Promise<void>} A promise that resolves when the tagged connections are established.
	 */
	async setup () {
		let to = {};
		if (this.dmv_issuer.toLowerCase().indexOf('http') >= 0)
			to.url = this.dmv_issuer;
		else
			to.name = this.dmv_issuer;

		logger.info(`Setting up a connection to trusted issuer: ${JSON.stringify(to)}`);
		let connection_offer = await this.agent.createConnection(to, {
			trustedDMV: 'true'
		});
		await this.agent.waitForConnection(connection_offer.id);
		logger.info(`Connection ${connection_offer.id} established`);

		to = {};
		if (this.hr_issuer.toLowerCase().indexOf('http') >= 0)
			to.url = this.hr_issuer;
		else
			to.name = this.hr_issuer;

		logger.info(`Setting up a connection to trusted issuer: ${JSON.stringify(to)}`);
		connection_offer = await this.agent.createConnection(to, {
			trustedHR: 'true'
		});
		await this.agent.waitForConnection(connection_offer.id);
		logger.info(`Connection ${connection_offer.id} established`);
	}

	/**
	 * Cleans up all the connections created for this signup flow.  Handy for when you need to change the properties
	 * you want to set on the connections to the issuers.
	 * @returns {Promise<void>} A promise that resolves when the connections created for this flow are deleted.
	 */
	async cleanup () {
		logger.info(`Cleaning up connections to the issuers: ${this.dmv_issuer} and ${this.hr_issuer}`);
		const connections = await this.agent.getConnections({
			$or: [
				{
					'remote.name': {$in: [ this.hr_issuer, this.dmv_issuer ]}
				},
				{
					'remote.url': {$in: [ this.hr_issuer, this.dmv_issuer ]}
				}
			]
		});
		logger.info(`Cleaning up ${connections.length} issuer connections`);
		for (const index in connections) {
			logger.debug(`Cleaning up connection ${connections[index].id}`);
			await this.agent.deleteConnection(connections[index].id);
		}
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

		logger.info(`Looking up credential definitions for issuer ${this.dmv_issuer}`);
		const dmv_cred_defs = await this.agent.getCredentialDefinitions(null, {trustedDMV: 'true'});
		logger.debug(`${this.dmv_issuer}'s credential definitions: ${JSON.stringify(dmv_cred_defs, 0, 1)}`);
		const dmv_restrictions = [];
		for (const agent_index in dmv_cred_defs.agents) {
			const agent = dmv_cred_defs.agents[agent_index];

			for (const cred_def_index in agent.results.items) {
				const cred_def_id = agent.results.items[cred_def_index].id;

				dmv_restrictions.push({cred_def_id: cred_def_id});
			}
		}

		logger.info(`Making sure we still have a connection to ${this.hr_issuer} and ${this.dmv_issuer}`);
		await this.setup();

		logger.info(`Looking up credential definitions for issuer ${this.hr_issuer}`);
		const hr_cred_defs = await this.agent.getCredentialDefinitions(null, {trustedHR: 'true'});
		logger.debug(`${this.hr_issuer}'s credential definitions: ${JSON.stringify(hr_cred_defs, 0, 1)}`);
		const hr_restrictions = [];
		for (const agent_index in hr_cred_defs.agents) {
			const agent = hr_cred_defs.agents[agent_index];

			for (const cred_def_index in agent.results.items) {
				const cred_def_id = agent.results.items[cred_def_index].id;

				hr_restrictions.push({cred_def_id: cred_def_id});
			}
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
			ssn: attributes.socialsecuritynumber,
			state: attributes.state,
			postal_code: attributes.zip_code,
			institution_number: 'bbcu123',
			transit_number: uuidv4(),
			account_number: uuidv4()
		};
	}
}

/**
 * Listens for and accepts incoming requests.  The AccountSignupHelper needs the other issuers to be running
 * one of these so that it can establish a connection to look up their credential definitions and build a proof schema.
 */
class SdkResponder {

	/**
	 * Constructor
	 *
	 * @param {Agent} agent Agent SDK object
	 * @param {integer} interval Interval in ms
	 * @param {Users} users User object
	 *
	 * @param {signup_helper} signup_helper
	 */
	constructor (agent, interval, users, connection_icon_provider, agent_info, signup_helper, login_helper) {
		if (!agent || typeof agent.getConnections !== 'function')
			throw new TypeError('Invalid agent for SdkResponder');
		if (interval !== undefined && typeof interval !== 'number' || interval < 0)
			throw new TypeError('Invalid polling interval for SdkResponder');
		this.agent = agent;
		this.stopped = true;
		this.interval = interval !== undefined ? interval : 3000;
		this.users = users;
		this.connection_icon_provider = connection_icon_provider;
		this.agent_info = agent_info;
		this.signup_helper = signup_helper;
		this.login_helper = login_helper;
	}

	/**
	 * Read schema file
	 *
	 * @param {string} schema_file Path of the schema file
	 * @returns {Object}
	 */
	getSchemaFile (schema_file) {
		if (!schema_file || typeof schema_file !== 'string')
			throw new TypeError('Invalid path to schema file');

		// Make sure the schema is a json file
		const ext = path.extname(schema_file).toLowerCase().substring(1); // Remove the period in the extension
		if (ext !== 'json')
			throw new Error (`File ${schema_file} is not a json file!`);

		// Make sure the file exists
		if (!fs.existsSync(schema_file))
			throw new Error(`File ${schema_file} does not exist`);

		logger.info(`Loading schema: ${schema_file}`);
		const content = fs.readFileSync(schema_file);
		const json = JSON.parse(content);
		return json;
	}

	// NOTE: Had to duplicate from agent code, since it doesn't set properties correctly
	/**
	 * Accept a connection offer.  If a connection id is passed, that connection will be updated from state
	 * `inbound_offer` to `connected` on this agent.  If a connection offer object from another agent is passed, the
	 * connection will be created and set to the `connected` state on this agent.
	 *
	 * @param {string|Connection} connection The ID for an existing connection, or an out-of-band connection offer.
	 * @param {Properties} [properties] Optional metadata to add to the connection offer.
	 * @return {Promise<Connection>} The updated connection information.
	 */
	async acceptConnection (connection, properties) {
		if (!connection)
			throw new TypeError('Connection information was not provided');

		let method, body, route;
		if (typeof connection === 'string') {

			if (properties && typeof properties !== 'object')
				throw new TypeError('Invalid properties for credential offer');

			logger.info(`Accepting existing connection with id ${connection}`);
			method = 'PATCH';
			route = `connections/${connection}`;

			body = {
				state: 'connected',
				properties: properties ? properties : {}
			};
			if (!body.properties.type) body.properties.type = 'child';

			// Add an optional friendly name to the request
			var name = this.agent.name;
			if (name && !body.properties.name) body.properties.name = name;

			// It's useful to timestamp offers so you can sort them by most recent
			if (!body.properties.time) body.properties.time = (new Date()).toISOString();

		} else if (typeof connection === 'object') {

			if (!connection.local || !connection.local.url)
				throw new TypeError('Out-of-band connection offer had invalid offerer information');

			logger.info(`Establishing out-of-band connection with ${connection.local.url}`);
			body = connection;
			route ='connections';
			method = 'POST';

		} else {
			throw new TypeError('Invalid connection information');
		}

		logger.debug(`Connection acceptance parameters: ${JSON.stringify(body)}`);
		const r = await this.agent.request(route, {
			method: method,
			body: JSON.stringify(body)
		});
		logger.info(`Accepted connection offer ${r.id}`);
		logger.debug('Result from acceptConnection: '+JSON.stringify(r));
		return r;
	}

	// NOTE: Had to duplicate from agent code, since it didn't have a way to set properties
	/**
	 * Updates a {@link Verification}.  A verifier accepts a `inbound_verification_request` by updating the state to
	 * `outbound_proof_request`.  The prover generates a proof for a `inbound_proof_request` by updating the state to
	 * `proof_generated`.  The prover submits that generated proof request by updating the state to `proof_shared`.
	 *
	 * Sometimes, you have a selection
	 * @param {string} id The verification ID.
	 * @param {VerificationState} state The updated verification state.
	 * @param {ProofSelection} [choices] The list of credentials you want to use for requested attributes and predicates.
	 * @param {object<string, string>} [self_attested_attributes] The self-attested data to add to the proof.
	 * @returns {Promise<Verification>} A Promise that resolves with the updated verification.
	 */
	async updateVerification (id, state, choices, self_attested_attributes, properties) {
		if (!id ||typeof id !== 'string')
			throw new TypeError('Invalid verification ID');
		if (!state || typeof state !== 'string')
			throw new TypeError('Invalid state for updating verification');
		if (choices && typeof choices !== 'object')
			throw new TypeError('Invalid credential selections for building proof');
		if (self_attested_attributes && typeof self_attested_attributes !== 'object')
			throw new TypeError('Invalid self attested attributes list for building proof');

		const body = {
			state: state
		};

		if (choices) body.choices = choices;
		if (self_attested_attributes) body.self_attested_attributes = self_attested_attributes;
		if (properties) body.properties = properties;

		logger.info(`Updating verification ${id} to state ${state}`);
		const r = await this.agent.request('verifications/' + id, {
			'method': 'PATCH',
			'body': JSON.stringify(body)
		});
		logger.debug('Result from proverGenerateProof: '+JSON.stringify(r));
		return r;
	}

	/**
	 * Start listening for Indy requests
	 */
	async start () {
		this.stopped = false;
		var icon = await this.connection_icon_provider.getImage();

		// TEST:

		// Get account schema and create if necessary
		let account_schema = null;
		let account_def = null;
		try {
			const json = this.getSchemaFile("/opt/app/docs/us_bank_account.json");
			let schemas = await this.agent.getCredentialSchemas({"name":json.name, "version":json.version});
			logger.info('Account schemas: ' + JSON.stringify(schemas,null,4));
			if (schemas.length > 0) {
				account_schema = schemas[0];
				logger.info(`Found account schema ${account_schema.id}`);
			}
			else {
				account_schema = await this.agent.createCredentialSchema(json.name, json.version, json.attributes);
				logger.info(`Created account schema ${account_schema.id}`);
			}
		} catch (error) {
			logger.error(`Error getting account schema: ${error}`);
		}

		// Get account cred def and create if necessary
		if (account_schema) {
			try {
				let defs = await this.agent.getCredentialDefinitions();
				logger.info('Cred defs = ' + JSON.stringify(defs,null,4));
				for (var i=0; i<defs.length; i++) {
					if ((defs[i].schema_name == account_schema.name) && (defs[i].schema_version == account_schema.version)) {
						account_def = defs[i];
						logger.info(`Found credit score def ${account_def.id}`);
						break;
					}
				}
				if (!account_def) {
					account_def = await this.agent.createCredentialDefinition(account_schema.id);
					logger.info(`Created credit score def ${account_def.id}`);
				}
			} catch (error) {
				logger.error(`Error getting account def: ${error}`);
			}
		}

		// Get credit_score schema and create if necessary
		let score_schema = null;
		let score_def = null;
		try {
			const json = this.getSchemaFile("/opt/app/docs/credit_score.json");
			let schemas = await this.agent.getCredentialSchemas({"name":json.name, "version":json.version});
			logger.info('Credit score schemas: ' + JSON.stringify(schemas,null,4));
			if (schemas.length > 0) {
				score_schema = schemas[0];
				logger.info(`Found credit score schema ${score_schema.id}`);
			}
			else {
				score_schema = await this.agent.createCredentialSchema(json.name, json.version, json.attributes);
				logger.info(`Created credit score schema ${score_schema.id}`);
			}
		} catch (error) {
			logger.error(`Error getting credit score schema: ${error}`);
		}

		// Get credit_score cred def and create if necessary
		if (score_schema) {
			try {
				let defs = await this.agent.getCredentialDefinitions();
				logger.info('Cred defs = ' + JSON.stringify(defs,null,4));
				for (var i=0; i<defs.length; i++) {
					if ((defs[i].schema_name == score_schema.name) && (defs[i].schema_version == score_schema.version)) {
						score_def = defs[i];
						logger.info(`Found credit score def ${score_def.id}`);
						break;
					}
				}
				if (!score_def) {
					score_def = await this.agent.createCredentialDefinition(score_schema.id);
					logger.info(`Created credit score def ${score_def.id}`);
				}
			} catch (error) {
				logger.error(`Error getting credit score def: ${error}`);
			}
		}

		// List proof schemas
		// NOTE: BBCU webapp creates a new proof schema in it's agent for every proof request & doesn't delete it
		try {
			let proof_schemas = await this.agent.verifierGetProofSchemas();
			var found = null;
			for (var i=0; i<proof_schemas.length; i++) {
				if ((proof_schemas[i].name == "Verify Employment") && (proof_schemas[i].version == "1.0")) {
					found = proof_schemas[i];
					break;
				}
			}
			logger.info("proof_schemas="+JSON.stringify(found,null,4));
			// delete old one
			if (found) {
				await this.deleteProofSchema(found.id);
			}

			//if (!found) {
				const proof_request = await this.signup_helper.getProofSchema();
				proof_request.version = "1.0";
				const account_proof_schema = await this.agent.createProofSchema(proof_request.name, proof_request.version,
					proof_request.requested_attributes, proof_request.requested_predicates);
				logger.debug(`Created Verify Employment proof schema: ${JSON.stringify(account_proof_schema)}`);
			//}
		}
		catch(error) {
			logger.error(`Error Verify Employment getting proof schemas: ${error}`);
		}

		// List proof schemas
		// NOTE: BBCU webapp creates a new proof schema in it's agent for every proof request & doesn't delete it
		try {
			let proof_schemas = await this.agent.verifierGetProofSchemas();
			var found = null;
			for (var i=0; i<proof_schemas.length; i++) {
				if ((proof_schemas[i].name == "BBCU Login Request") && (proof_schemas[i].version == "1.0")) {
					found = proof_schemas[i];
					break;
				}
			}
			logger.info("proof_schemas="+JSON.stringify(found,null,4));
			// delete old one
			if (found) {
				await this.deleteProofSchema(found.id);
			}

			//if (!found) {

			const my_credential_definitions = await this.agent.getCredentialDefinitions();
			logger.debug(`${this.agent.user}'s list of credential definitions: ${JSON.stringify(my_credential_definitions, 0, 1)}`);

			// This returns cred defs for all schemas, not just account schemas
			let account_credential_definitions = [];
			for (var i=0; i<my_credential_definitions.length; i++) {
				if (my_credential_definitions[i].schema_name == "BBCU Account") {
					account_credential_definitions.push(my_credential_definitions[i]);
				}
			}

			//if (!my_credential_definitions.length) {
			if (!account_credential_definitions.length) {
				const err = new Error(`No credential definitions were found for issuer ${this.agent.user}!`);
				err.code = LOGIN_ERRORS.LOGIN_NO_CREDENTIAL_DEFINITIONS;
				throw err;
			}
			//my_credential_definitions.sort(sortSchemas).reverse();
			account_credential_definitions.sort(this.sortSchemas).reverse();
			//const cred_def_id = my_credential_definitions[0].id;
			const cred_def_id = account_credential_definitions[0].id;
			for (var i=0; i<account_credential_definitions.length; i++) {
				logger.debug(`${i}: Account cred def for schema ${account_credential_definitions[i].schema_name} v${account_credential_definitions[i].schema_version}`);
			}

			logger.debug(`Checking for attributes with credential definition id ${cred_def_id}`);
			const proof_request = await this.login_helper.getProofSchema({
				restrictions: [ {cred_def_id: account_credential_definitions[0].id} ]
				//restrictions: [ {"schema_name": "BBCU Account", "schema_version": "1.1"} ]
			});

			proof_request.version = "1.0";
			const account_proof_schema = await this.agent.createProofSchema(proof_request.name, proof_request.version,
				proof_request.requested_attributes, proof_request.requested_predicates);
			logger.debug(`>>>> Created BBCU Login Request proof schema: ${JSON.stringify(account_proof_schema)}`);
			//}
		}
		catch(error) {
			logger.error(`>>>> Error getting BBCU Login Request proof schemas: ${error}`);
		}

		var userlist = await this.users.read_users();
		logger.info(">>> users="+JSON.stringify(userlist,null,4));
/*
bbcu_1     | 2019-10-22T18:09:23.823Z [libs/helpers.js] info: >>> users={
bbcu_1     |     "alice@example.com": {
bbcu_1     |         "_id": "alice@example.com",
bbcu_1     |         "_rev": "9-4912c325dcc9d656ed69eec23ee5ac11",
bbcu_1     |         "email": "alice@example.com",
bbcu_1     |         "type": "user",
bbcu_1     |         "personal_info": {
bbcu_1     |             "first_name": "Alice",
bbcu_1     |             "middle_name": "_",
bbcu_1     |             "last_name": "Garcia",
bbcu_1     |             "dob": "04/10/1971",
bbcu_1     |             "dob_timestamp": 464,
bbcu_1     |             "address_line_1": "716 Duck Creek Road",
bbcu_1     |             "address_line_2": "_",
bbcu_1     |             "ssn": "111-222-3333",
bbcu_1     |             "state": "AZ",
bbcu_1     |             "postal_code": "94104",
bbcu_1     |             "institution_number": "bbcu123",
bbcu_1     |             "transit_number": "00756983-75c4-40be-bf50-3024d8b10b68",
bbcu_1     |             "account_number": "2afdcf30-c8ed-4d7b-8734-85e7b8db5c00",
bbcu_1     |             "email": "alice@example.com"
bbcu_1     |         },
bbcu_1     |         "opts": {
bbcu_1     |             "agent_name": "https://alice:@124dff934a7e113aac08e8e2dd31dab59febfa3b3577f61059f82e93.staging-cloud-agents.us-east.containers.appdomain.cloud"
bbcu_1     |         }
bbcu_1     |     }
bbcu_1     | }
*/
		async.until(
			() => { return this.stopped; },
			async () => {

				// Handle requests to issue credentials
				try {
					const offers = await this.agent.getCredentials({
						state: 'inbound_request'
					});
					logger.info('Credential Requests: ' + offers.length);
					//logger.info(offers);
					for (var i=0; i<offers.length; i++) {
						const offer = offers[i];
						logger.info("id="+offer.id+" state="+offer.state+" schema="+offer.schema_name+"-"+offer.schema_version);
					}
					//this.stopped = true;
					if (offers.length > 0) {
						const offer = offers[0];
						logger.info("cred req="+JSON.stringify(offer,null,4));

						// Get user who requested credential
						var user = null;
						var userlist = await this.users.read_users();
						logger.info(">>> users="+JSON.stringify(userlist,null,4));
						for (var i in userlist) {
							if (userlist[i].opts && (userlist[i].opts.agent_name == offer.connection.remote.url)) {
								user = userlist[i];
								break;
							}
						}
						var requestor = offer.connection.remote.url; //or .iurl

						try {
							logger.info(`Accepting credential request ${offer.id} from ${offer.connection.remote.name}`);
							var attributes = null;

							// If credit score
							if ((offer.schema_name == score_schema.name) && (offer.schema_version == score_schema.version)) {
								attributes = {"first_name": user.personal_info.first_name, "middle_name": user.personal_info.middle_name, "last_name": user.personal_info.last_name,
									"dob": user.personal_info.dob, "ssn": user.personal_info.ssn, "score": "600"};
							}

							// TEST: If account
							else if ((offer.schema_name == account_schema.name) && (offer.schema_version == account_schema.version)) {
								attributes = await this.accountSignUp(offer, user);
								//attributes = {"account_number": user.personal_info.account_number};
							}

							// Issue credential
							if (attributes) {
								const r = await this.agent.updateCredential(offer.id, "outbound_offer", attributes);
								logger.info(`Accepted credential request ${offer.id} from ${offer.connection.remote.name}`);
							}
							else {
								throw new Error("Credential schema not found");
							}
						} catch (error) {
							logger.error(`Couldn't accept credential request ${offer.id}. Error: ${error}`);
							logger.info(`Deleting bad credential request ${offer.id}`);

							//TODO: Need a way to tell user that we can't issue credential
							//await this.agent.updateCredential(offer.id, "outbound_offer", {});
							//await this.agent.updateCredential(offer.id, "deleted");
							await this.agent.deleteCredential(offer.id);
						}
					}

				} catch (error) {
					logger.error(`Failed to respond to SDK credential request: ${error}`);
				}

				// Handle connection requests and automatically accept
				try {
					const offers = await this.agent.getConnections({
						state: 'inbound_offer'
					});
					logger.info('Connection Requests: ' + offers.length);
					//logger.info(offers);
					for (var i=0; i<offers.length; i++) {
						const offer = offers[i];
						logger.info("id="+offer.id+" state="+offer.state);
					}
					//this.stopped = true;
					if (offers.length > 0) {
						const offer = offers[0];
						logger.info("conn req="+JSON.stringify(offer,null,4));

						// Get user who requested connection
						var user = null;
						var userlist = await this.users.read_users();
						logger.info(">>> users="+JSON.stringify(userlist,null,4));
						for (var i in userlist) {
							if (userlist[i].opts && (userlist[i].opts.agent_name == offer.remote.url)) {
								user = userlist[i];
								break;
							}
						}
						var requestor = offer.remote.url; //or .iurl

						try {
							logger.info(`Accepting connection offer ${offer.id} from  ${offer.remote.name}`);
							const r = await this.acceptConnection(offer.id, {"icon": icon});
							logger.info(`Accepted connection offer ${r.id} from ${r.remote.name}`);
						} catch (error) {
							logger.error(`Couldn't accept connection offer ${offer.id}. Error: ${error}`);
							logger.info(`Deleting bad connection offer ${offer.id}`);
							await this.agent.deleteConnection(offer.id);
						}
					}

				} catch (error) {
					logger.error(`Failed to respond to SDK connection request: ${error}`);
				}

				// Handle proof requests and automatically respond
				try {
					const offers = await this.agent.getVerifications({
						state: 'inbound_proof_request'
					});
					logger.info('Proof Requests: ' + offers.length);
					//logger.info(offers);
					for (var i=0; i<offers.length; i++) {
						const offer = offers[i];
						logger.info("id="+offer.id+" state="+offer.state);
					}
					//this.stopped = true;
					if (offers.length > 0) {
						const offer = offers[0];
						logger.info("proof req="+JSON.stringify(offer,null,4));
						var id = offer.id;

						// Get user who requested proof
						var user = null;
						var userlist = await this.users.read_users();
						logger.info(">>> users="+JSON.stringify(userlist,null,4));
						for (var i in userlist) {
							if (userlist[i].opts && (userlist[i].opts.agent_name == offer.connection.remote.url)) {
								user = userlist[i];
								break;
							}
						}
						var requestor = offer.connection.remote.url; //or .iurl

						try {
							logger.info(`Accepting proof request ${offer.id} from ${offer.connection.remote.name}`);
							var proof_request = offer.proof_request;
							var name = proof_request.name;
							var version = proof_request.version;
							var choices = {};
							var requested_attributes = proof_request.requested_attributes;
							if ((name == "Mortgage Rates") && (version == "1.0")) {
								console.log(" -- mortgage rate req found");
								var self_attested_attributes = {};
								for (var key in requested_attributes) {
									var attrName = requested_attributes[key];
									if (key == "30_yr_fixed_points_referent") {
										self_attested_attributes[key] = "0";
									}
									else if (key == "30_yr_fixed_rate_referent") {
										self_attested_attributes[key] = "3.75";
									}
									else if (key == "5_yr_adj_points_referent") {
										self_attested_attributes[key] = "0.25";
									}
									else if (key == "5_yr_adj_rate_referent") {
										self_attested_attributes[key] = "2.5";
									}
									else if (key == "bank_referent") {
										self_attested_attributes[key] = "Big Blue Credit Union";
									}
								}
							}
							else if ((name == "Telephone") && (version == "1.0")) {
								console.log(" -- telephone req found");
								var self_attested_attributes = {};
								for (var key in requested_attributes) {
									var attrName = requested_attributes[key];
									if (key == "phone_referent") {
										self_attested_attributes[key] = "123-456-7890";
									}
									if (key == "bank_referent") {
										self_attested_attributes[key] = "Big Blue Credit Union";
									}
								}
							}
							logger.info("self_attested_attributes="+JSON.stringify(self_attested_attributes,null,4));
							var proof = await this.agent.updateVerification(id, "proof_generated", choices, self_attested_attributes);
							logger.info("proof after updated to generated="+JSON.stringify(proof,null,4));
							proof = await this.waitForState(id, [ 'proof_generated', 'failed' ],20, 3000)
							proof = await this.agent.updateVerification(id, "proof_shared");
							proof = await this.agent.waitForVerification(id, 20, 3000)
							logger.info("proof after verified="+JSON.stringify(proof,null,4));

						} catch (error) {
							logger.error(`Couldn't accept proof request ${offer.id}. Error: ${error}`);
							logger.info(`Deleting bad proof request ${offer.id}`);
							//await this.agent.deleteVerification(offer.id);
						}
					}

				} catch (error) {
					logger.error(`Failed to respond to SDK proof request: ${error}`);
				}

				// Handle verification requests and automatically respond
				try {
					const offers = await this.agent.getVerifications({
						state: 'inbound_verification_request'
					});
					logger.info('Verification Requests: ' + offers.length);
					//logger.info(offers);
					for (var i=0; i<offers.length; i++) {
						const offer = offers[i];
						logger.info("id="+offer.id+" state="+offer.state);
					}
					//this.stopped = true;
					if (offers.length > 0) {
						const offer = offers[0];
						logger.info("proof req="+JSON.stringify(offer,null,4));
						var id = offer.id;
						// Get user who requested proof
						var user = null;
						var userlist = await this.users.read_users();
						logger.info(">>> users="+JSON.stringify(userlist,null,4));
						for (var i in userlist) {
							if (userlist[i].opts && (userlist[i].opts.agent_name == offer.connection.remote.url)) {
								user = userlist[i];
								break;
							}
						}
						var requestor = offer.connection.remote.url; //or .iurl

						try {
							logger.info(`Accepting proof request ${offer.id} from ${offer.connection.remote.name}`);
							var p = offer.properties;
							if (!p.icon) {
								p.icon = icon;
							}
							var proof = await this.updateVerification(id, "outbound_proof_request", null, null, p);
							logger.info("proof after sent="+JSON.stringify(proof,null,4));
							proof = await this.waitForState(id, [ 'proof_shared', 'failed', 'passed' ], 50, 3000)
							logger.info("proof after shared="+JSON.stringify(proof,null,4));

						} catch (error) {
							logger.error(`Couldn't accept proof request ${offer.id}. Error: ${error}`);
							logger.info(`Deleting bad proof request ${offer.id}`);
							await this.agent.deleteVerification(offer.id);
						}
					}

				} catch (error) {
					logger.error(`Failed to respond to SDK verification request: ${error}`);
				}

				return new Promise((resolve, reject) => {
					setTimeout(resolve, this.interval);
				});
			},
			(error) => {
				logger.error(`Stopping SDK responder: ${error}`);
				this.stopped = false;
			}
		);
	}

	/**
	 * Set interval
	 *
	 * @param {int} interval Interval in ms
	 */
	set_interval (interval) {
		if (typeof interval !== 'number' || interval < 0)
			throw new TypeError('SdkResponder interval must be >= 0');
		this.interval = interval;
	}

	/**
	 * Stop listener
	 */
	async stop () {
		console.log("***** SdkResponder.stop() *****")
		this.stopped = true;
	}

	sortSchemas (a, b) {
		const aData = parseInt(JSON.parse(a.data).schemaId, 10);
		const bData = parseInt(JSON.parse(b.data).schemaId, 10);
		return aData - bData;
	}

	/**
	 * Starts the Signup and begins verifying a user's records and creating their account.
	 *
	 * @param {credential} offer The credential offer from the user
	 * @returns {user} The user if they exist
	 */
	async accountSignUp(offer, user) {
		// Get icon to use for connection and credential
		const icon = await this.connection_icon_provider.getImage();

		let connection = offer.connection;
		this.id = offer.id;
		try {

			logger.info(`Starting credential signup flow from SDK ${this.id}`);

			const my_credential_definitions = await this.agent.getCredentialDefinitions();
			//logger.debug(`${this.agent.user}'s list of credential definitions: ${JSON.stringify(my_credential_definitions, 0, 1)}`);

			// This returns cred defs for all schemas, not just account schemas
			let account_credential_definitions = [];
			for (var i=0; i<my_credential_definitions.length; i++) {
				if (my_credential_definitions[i].schema_name == "BBCU Account") {
					account_credential_definitions.push(my_credential_definitions[i]);
				}
			}

			//if (!my_credential_definitions.length) {
			if (!account_credential_definitions.length) {
				const err = new Error(`No credential definitions were found for issuer ${this.agent.user}!`);
				throw err;
			}

			//my_credential_definitions.sort(sortSchemas).reverse();
			//const schema_id = my_credential_definitions[0].schema_id;
			account_credential_definitions.sort(this.sortSchemas).reverse();
			for (var i=0; i<account_credential_definitions.length; i++) {
				logger.debug(`${i}: Account cred def for schema ${account_credential_definitions[i].schema_name} v${account_credential_definitions[i].schema_version}`);
			}
			const schema_id = account_credential_definitions[0].schema_id;
			logger.debug(`Issuing credential to new user with schema ${schema_id}`);

			const schema = await this.agent.getCredentialSchema(schema_id);
			if (!schema) {
				const err = new Error('Failed to lookup the selected schema');
				throw err;
			}

			logger.info(`Creating signup proof schema for schema ID: ${schema_id}`);
			const proof_request = await this.signup_helper.getProofSchema();

			const account_proof_schema = await this.agent.createProofSchema(proof_request.name, proof_request.version,
				proof_request.requested_attributes, proof_request.requested_predicates);
			logger.debug(`Created proof schema: ${JSON.stringify(account_proof_schema)}`);

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

			logger.info(`Checking the validity of the proof in verification ${proof.id}`);
			await this.signup_helper.checkProof(proof);

			this.user = offer.connection.remote.name + "@example.com";
			this.password = "password";
			this.agent_name = offer.connection.remote.url;
			logger.info(`Creating user record for ${this.user}`);
			var personal_info = await this.signup_helper.proofToUserRecord(proof);
			personal_info.email = this.user;

			var user_doc = null;
			// If user already exists, get it
			if (user) {
				user_doc = user;
				// (don't update user record - but could if we wanted to)
				//update_user (this.user, personal_info);
			}
			else {
				user_doc = await this.users.create_user(this.user, this.password, personal_info, {
				agent_name: this.agent_name
				});
			}
			logger.debug(`User record: ${JSON.stringify(user_doc)}`);

			var cred_attributes = {};
			for (const index in schema.attr_names) {
				const attr_name = schema.attr_names[index];
				// Certain attributes are supposed to contain rendered images of the credential
				if (attr_name === 'card_front') {
					cred_attributes[attr_name] = ""; //await this.card_renderer.createCardFront(personal_info);
				} else if (attr_name === 'card_back') {
					cred_attributes[attr_name] = ""; //await this.card_renderer.createCardBack(personal_info);
				} else {

					// Make sure the user has data for this attribute
					if (!user_doc.personal_info || [ 'string', 'number' ].indexOf(typeof user_doc.personal_info[attr_name]) < 0) {
						const err = new Error(`User record was missing data '${attr_name}', which is required for creating a credential`);
						throw err;
					}
					if (typeof user_doc.personal_info[attr_name] === 'number')
						cred_attributes[attr_name] = '' + user_doc.personal_info[attr_name];
					else
						cred_attributes[attr_name] = user_doc.personal_info[attr_name];				}
			}

			return cred_attributes;
		} catch (error) {
			logger.error(`Signup failed: ${error.code ? error.code : ' '}${error}`);
			return null;
		}
	}

	/**
	 * Wait for object to enter the wait_state
	 *
	 * @param {string} id
	 * @param {array} wait_state
	 * @param {integer} retries
	 * @param {integer} retry_interval
	 */
	async waitForState(id, wait_state, retries, retry_interval) {
		logger.info("waitForState()");
		let attempts = 0;
		const retry_opts = {
			times: retries ? retries : 30,
			interval: retry_interval ? retry_interval : 3000,
			errorFilter: (error) => {
				// We should stop if the error was something besides still waiting for the credential.
				return error.toString().toLowerCase().indexOf('waiting') >= 0;
			}
		};

		return new Promise((resolve, reject) => {
			async.retry(retry_opts, async () => {

				logger.debug(`Checking status of verification ${id}. Attempt ${++attempts}/${retry_opts.times}`);

				const updated_verification = await this.agent.getVerification(id);
				if (!updated_verification || !updated_verification.state) {
					throw new Error('Verification state could not be determined');
				} else if (wait_state.indexOf(updated_verification.state) >= 0) {
					return updated_verification;
				} else {
					logger.debug(` -- state=${updated_verification.state}`);
					throw new Error('Still waiting on Verification');
				}
			}, (error, accepted_verification) => {
				if (error) {
					logger.error(`Failed to complete verification ${id}: ${error}`);
					return reject(new Error(`Verification ${id} failed: ${error}`));
				}

				logger.info(`Verification ${accepted_verification.id} was completed`);
				resolve (accepted_verification);
			});
		});
	}

	async deleteProofSchema(id) {
		if (!id || typeof id !== 'string')
			throw new TypeError('Proof schema ID was not provided');

		logger.info(`Deleting proof schema ${id}`);
		const r = await this.agent.request('proof_schemas/' + id, {
			method: 'DELETE'
		});
		logger.info(`Deleted proof schema ${id}`);
		logger.debug('Result from deleteProofSchema: '+JSON.stringify(r));
	}

}

module.exports = {
	LoginHelper,
	NullProofHelper,
	AccountSignupHelper,
	SdkResponder
};

