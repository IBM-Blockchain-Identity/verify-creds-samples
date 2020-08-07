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

const express = require('express');
const bodyParser = require('body-parser');
const compression = require('compression');

/**
 * Creates an express router representing a Credentials REST API for managing user credentials.
 * @param {IssuanceManager} issuance_manager An instance of the Credentials class which provides backend functionality for
 * credential api endpoints.
 * @param {Middleware} middleware Authentication middleware used to protect API endpoints.
 * @returns {object} An express router for the users API.
 */
exports.createRouter = function (issuance_manager, middleware) {

	if (!issuance_manager || typeof issuance_manager.create_issuance !== 'function')
		throw new TypeError('Credentials API was not given a Credentials instance');

	const router = express.Router();
	router.use(bodyParser.urlencoded({extended: true}));
	router.use(bodyParser.json());
	router.use(bodyParser.text());
	router.use(compression());

	/* POST issue a credential */
	router.post('/credentials', [ middleware.is_logged_in ], (req, res, next) => {
		if (!req.session || !req.session.user_id)
			return res.status(400).json({
				error: CREDENTIAL_API_ERRORS.BAD_REQUEST,
				reason: 'A user ID is required in order to issue a credential'
			});

		req.session.issuance_id = issuance_manager.create_issuance(req.session.user_id);
		res.status(201).json({
			message: 'Credential issuance started'
		});
	});

	/* GET check the status of a credential issuance flow */
	router.get('/credentials/', [ middleware.is_logged_in ], (req, res, next) => {

		if (!req.session || !req.session.issuance_id)
			return res.status(400).json({
				error: CREDENTIAL_API_ERRORS.BAD_REQUEST,
				reason: 'There is no issuance flow associated with this user'
			});

		try {
			const status = issuance_manager.get_issuance_status(req.session.issuance_id);
			status.message = 'Got the issuance status';
			res.json(status);
		} catch (e) {
			return res.status(500).json({
				error: e.code ? e.code : CREDENTIAL_API_ERRORS.UNKNOWN_CREDENTIALS_API_ERROR,
				reason: `Failed to lookup issuance status: ${e.message}`
			});
		}
	});

	/* DELETE stop a credential issuance flow */
	router.delete('/credentials/', [ middleware.is_logged_in ], (req, res, next) => {

		if (!req.session || !req.session.issuance_id)
			return res.status(400).json({
				error: CREDENTIAL_API_ERRORS.BAD_REQUEST,
				reason: 'There is no issuance flow associated with this user'
			});

		res.status(501).json({
			error: 'Not Implemented',
			reason: 'Stopping credential issuance is not implemented yet'
		});
	});

	return router;
};

const CREDENTIAL_API_ERRORS = {
	UNKNOWN_CREDENTIALS_API_ERROR: 'UNKNOWN_CREDENTIALS_API_ERROR',
	BAD_REQUEST: 'BAD_REQUEST'
};
exports.CREDENTIAL_API_ERRORS = CREDENTIAL_API_ERRORS;