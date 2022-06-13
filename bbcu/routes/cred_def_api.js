/**
 © Copyright IBM Corp. 2019

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

/**
 * Creates an express router representing a REST API for managing credential definitions.
 * @param {Agent} agent An instance of the CredentialDefs class with a backend credential definition database.
 * @param {Middleware} middleware Authentication middleware used to protect API endpoints.
 * @returns {object} An express router for the credential definitions API.
 */
exports.createRouter = function (agent, middleware) {

	if (!agent || typeof agent.getCredentialDefinitions !== 'function')
		throw new TypeError('Credential Definitions API was not given an Agent');

	const router = express.Router();
	router.use(bodyParser.urlencoded({extended: true}));
	router.use(bodyParser.json());
	router.use(bodyParser.text());
	router.use(compression());

	/* POST a new credential definition */
	router.post('/creddefs', [ middleware.is_admin ], async (req, res, next) => {

		const schema_id = req.body.schema_id;
		if (!schema_id || typeof schema_id !== 'string')
			return res.status(400).send({error: CRED_DEF_API_ERRORS.CRED_DEF_INVALID_SCHEMA_ID,
				reason: 'schema_id ID was not a non-empty string'});

		try {
			const cred_def = await agent.createCredentialDefinition(schema_id);
			res.status(201).json({message: `Created credential definition ${cred_def.id}`, cred_def: cred_def});

		} catch (error) {
			error.code = error.code ? error.code : CRED_DEF_API_ERRORS.UNKNOWN_CRED_DEF_API_ERROR;
			return res.status(500).send({error: error.code, reason: error.message});

		}
	});

	/* GET all credential definitions */
	router.get('/creddefs', async (req, res, next) => {
		try {
			const cred_defs = await agent.getCredentialDefinitions();
			res.json({message: 'Got the full list of credential definitions', cred_defs: cred_defs});

		} catch (error) {
			error.code = error.code ? error.code : CRED_DEF_API_ERRORS.UNKNOWN_CRED_DEF_API_ERROR;
			return res.status(500).send({error: error.code, reason: error.message});
		}
	});

	return router;
};

const CRED_DEF_API_ERRORS = {
	UNKNOWN_CRED_DEF_API_ERROR: 'UNKNOWN_CRED_DEF_API_ERROR',
	CRED_DEF_INVALID_NAME: 'CRED_DEF_INVALID_NAME',
	CRED_DEF_INVALID_SCHEMA_ID: 'CRED_DEF_INVALID_SCHEMA_ID'
};
exports.CRED_DEF_API_ERRORS = CRED_DEF_API_ERRORS;