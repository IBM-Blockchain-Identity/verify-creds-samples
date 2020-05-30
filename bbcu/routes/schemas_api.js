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

const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const compression = require('compression');
const semverCompare = require('semver-compare');

/**
 * Creates an express router representing a REST API for managing schemas.
 * @param {Agent} agent An agent instance associated with this web app.
 * @param {string} schema_path A path to the default schema for this issuer.
 * @param {Middleware} middleware Authentication middleware used to protect API endpoints.
 * @returns {object} An express router for the schemas API.
 */
exports.createRouter = function (agent, schema_path, middleware) {

	if (!agent || typeof agent.getCredentialSchemas !== 'function')
		throw new TypeError('Schemas API was not given an Agent');
	if (!schema_path || typeof schema_path !== 'string')
		throw new TypeError('Schemas API was not given a default schema path');

	const router = express.Router();
	router.use(bodyParser.urlencoded({extended: true}));
	router.use(bodyParser.json());
	router.use(bodyParser.text());
	router.use(compression());

	// GET the default schema (for publishing from the UI)
	router.get('/schema_templates/default', async (req, res, next) => {
		try {
			const template_schema = await new Promise((resolve, reject) => {
				fs.readFile(schema_path, (error, file) => {
					if (error) return reject(error);
					file = JSON.parse(file);
					if (!file.name || !file.version)
						return reject(new Error('Invalid proof schema'));
					resolve(file);
				});
			});
			res.status(200).json({message: `Got template schema ${template_schema.name}`, schema: template_schema});
		} catch (error) {
			error.code = error.code ? error.code : SCHEMA_API_ERRORS.UNKNOWN_SCHEMA_API_ERROR;
			return res.status(500).send({error: error.code, reason: error.message});
		}
	});

	/* POST a new schema */
	router.post('/schemas', [ middleware.is_admin ], async (req, res, next) => {

		const name = req.body.name;
		if (!name || typeof name !== 'string')
			return res.status(400).send({error: SCHEMA_API_ERRORS.SCHEMA_INVALID_NAME,
				reason:'Schema name was not a non-empty string'});

		const version = req.body.version;
		if (!version || typeof version !== 'string')
			return res.status(400).send({error: SCHEMA_API_ERRORS.SCHEMA_INVALID_VERSION,
				reason: 'Schema version was not a non-empty string'});
		if (version.split('.').length < 2 || version.split('.').length > 3) // 1.0 or 1.0.1 are valid
			return res.status(400).send({error: SCHEMA_API_ERRORS.SCHEMA_INVALID_VERSION,
				reason: 'Schema version was not a semver (\'1.0\' or \'1.0.0\', for example)'});

		const attributes = req.body.attributes;
		if (!attributes || !Array.isArray(attributes) || attributes.length <= 0 || typeof attributes[0] !== 'string')
			return res.status(400).send({error: SCHEMA_API_ERRORS.SCHEMA_INVALID_ATTRIBUTES,
				reason: 'Schema attribute list was not an array of strings representing attribute names'});

		try {
			const schema = await agent.createCredentialSchema(name, version, attributes);
			res.status(201).json({message: `Created schema ${schema.id}`, schema: schema});

		} catch (error) {
			error.code = error.code ? error.code : SCHEMA_API_ERRORS.UNKNOWN_SCHEMA_API_ERROR;
			return res.status(500).send({error: error.code, reason: error.message});
		}
	});


	/* GET all schemas */
	router.get('/schemas', async (req, res, next) => {
		try {
			const schemas = await agent.getCredentialSchemas();
			if (req.query && req.query.sort && req.query.sort === 'true' && schemas && schemas.length > 1) {
				schemas.sort(sortSchemas).reverse();
			}
			res.send({message: 'Got the full list of schemas', schemas: schemas});
		} catch (error) {
			error.code = error.code ? error.code : SCHEMA_API_ERRORS.UNKNOWN_SCHEMA_API_ERROR;
			return res.status(500).send({error: error.code, reason: error.message});
		}
	});

	/* GET all proof schemas */
	router.get('/proof_schemas', async (req, res, next) => {
		try {
			let queryObj = {};
			if (req.query && req.query.name && req.query.name.length > 0) {
				queryObj = {name: req.query.name};
			}
			const schemas = await agent.verifierGetProofSchemas(queryObj);
			if (req.query && req.query.sort && req.query.sort === 'true' && schemas && schemas.length > 1) {
				schemas.sort(sortSchemas).reverse();
			}
			res.send({message: 'Got the full list of proof schemas', schemas: schemas});
		} catch (error) {
			error.code = error.code ? error.code : SCHEMA_API_ERRORS.UNKNOWN_SCHEMA_API_ERROR;
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
	return semverCompare(a.version, b.version);
}

const SCHEMA_API_ERRORS = {
	UNKNOWN_SCHEMA_API_ERROR: 'UNKNOWN_SCHEMA_API_ERROR',
	SCHEMA_INVALID_NAME: 'SCHEMA_INVALID_NAME',
	SCHEMA_INVALID_VERSION: 'SCHEMA_INVALID_VERSION',
	SCHEMA_INVALID_ATTRIBUTES: 'SCHEMA_INVALID_ATTRIBUTES',
	SCHEMA_INVALID_SCHEMA_ID: 'SCHEMA_INVALID_SCHEMA_ID'
};
exports.SCHEMA_API_ERRORS = SCHEMA_API_ERRORS;