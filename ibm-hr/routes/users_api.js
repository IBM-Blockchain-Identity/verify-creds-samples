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

const express = require('express');
const bodyParser = require('body-parser');
const compression = require('compression');

const USER_ERRORS = require('../libs/users.js').USERS_ERRORS;

/**
 * Creates an express router representing a Users REST API for managing users.
 * @param {object} users_instance An instance of the Users class with a backend user database.
 * @param {Agent} agent An cloud agent.
 * @returns {object} An express router for the users API.
 */
exports.createRouter = function (users_instance, agent) {

	if (!users_instance || typeof users_instance.read_user !== 'function')
		throw new TypeError('Users API was not given a Users instance');
	if (!agent || typeof agent.deleteConnection !== 'function')
		throw new TypeError('Users API was not given an Agent');

	const router = express.Router();
	router.use(bodyParser.urlencoded({extended: true}));
	router.use(bodyParser.json());
	router.use(bodyParser.text());
	router.use(compression());

	/* GET all users */
	router.get('/users', async (req, res, next) => {
		try {
			const users = await users_instance.read_users();
			res.json({users: users});

		} catch (error) {
			error.code = error.code ? error.code : USER_API_ERRORS.UNKNOWN_USER_API_ERROR;
			return res.status(500).json({error: error.code, reason: error.message});
		}
	});

	/* GET a user */
	router.get('/users/:user_id', async (req, res, next) => {
		try {
			const user_doc = await users_instance.read_user(req.params.user_id);
			const response = {};
			response[user_doc.email] = user_doc;
			res.json(response);

		} catch (error) {
			error.code = error.code ? error.code : USER_API_ERRORS.UNKNOWN_USER_API_ERROR;
			let status = 500;
			if (error.code === USER_ERRORS.USER_DOES_NOT_EXIST)
				status = 404;
			return res.status(status).json({error: error.code, reason: error.message});
		}
	});

	/* POST a new user */
	router.post('/users/:user_id', async (req, res, next) => {
		const user_id = req.params.user_id;

		if (!req.body || typeof req.body.personal_info !== 'object') {
			return res.status(400).json({
				error: USER_API_ERRORS.USER_PERSONAL_INFO_NOT_FOUND,
				reason: 'key \'personal_info\' was not found in the user creation request'
			});
		}
		const personal_info = req.body.personal_info;

		if (!req.body || typeof req.body.opts !== 'object') {
			return res.status(400).json({
				error: USER_API_ERRORS.BAD_REQUEST,
				reason: 'key \'opts\' was not found in the user creation request'
			});
		}
		const opts = req.body.opts;

		if (!req.body || typeof req.body.password !== 'string') {
			return res.status(400).json({
				error: USER_API_ERRORS.BAD_REQUEST,
				reason: 'key \'password\' was not found in the user creation request'
			});
		}
		const password = req.body.password;

		try {
			const user_doc = await users_instance.create_user(user_id, password, personal_info, opts);

			const resp = {};
			delete user_doc._rev;
			resp[user_doc.email] = user_doc;
			res.status(201).json(resp);

		} catch (error) {
			error.code = error.code ? error.code : USER_API_ERRORS.UNKNOWN_USER_API_ERROR;
			let status = 500;
			if (error.code === USER_ERRORS.USER_ALREADY_EXISTS)
				status = 409;
			else if (error.code === USER_ERRORS.USER_DOES_NOT_EXIST)
				status = 404;
			return res.status(status).json({error: error.code, reason: error.message});
		}
	});

	/* PUT updates to a user */
	router.put('/users/:user_id', async (req, res, next) => {
		const personal_info = req.body.personal_info;
		if (typeof personal_info !== 'object')
			return res.status(400).json({error: USER_API_ERRORS.USER_PERSONAL_INFO_NOT_FOUND,
				reason: 'Update requests must supply updated personal information'});

		const user = req.params.user_id;

		if (!req.body || typeof req.body.opts !== 'object') {
			return res.status(400).json({
				error: USER_API_ERRORS.BAD_REQUEST,
				reason: 'key \'opts\' was not found in the user creation request'
			});
		}
		const opts = req.body.opts;

		try {
			const updated_doc = await users_instance.update_user(user, personal_info, opts);

			const resp = {};
			delete updated_doc._rev;
			resp[updated_doc.email] = updated_doc;
			res.status(200).json(resp);
		} catch (error) {
			error.code = error.code ? error.code : USER_API_ERRORS.UNKNOWN_USER_API_ERROR;
			let status = 500;
			if (error.code === USER_ERRORS.USER_DOES_NOT_EXIST)
				status = 404;
			return res.status(status).json({error: error.code, reason: error.message});
		}
	});

	/* DELETE a user */
	router.delete('/users/:user_id', async (req, res, next) => {
		const username = req.params.user_id;

		let userDoc;
		try {
			userDoc = await users_instance.read_user(username);

		} catch (error) {
			error.code = error.code ? error.code : USER_API_ERRORS.UNKNOWN_USER_API_ERROR;
			let status = 500;
			if (error.code === USER_ERRORS.USER_DOES_NOT_EXIST)
				status = 404;
			return res.status(status).json({error: error.code, reason: error.message});
		}

		try {
			// Clean up connections to the user
			if (userDoc.opts && userDoc.opts.agent_name) {
				const search = {};
				if (userDoc.opts.agent_name.toLowerCase().indexOf('http') >= 0)
					search['remote.url'] = userDoc.opts.agent_name;
				else
					search['remote.name'] = userDoc.opts.agent_name;

				const connections = await agent.getConnections(search);
				for (const index in connections) {
					await agent.deleteConnection(connections[index].id);
				}
			}

			await users_instance.delete_user(req.params.user_id);
			res.json({message: `Deleted user ${username}`});
		} catch (error) {
			error.code = error.code ? error.code : USER_API_ERRORS.UNKNOWN_USER_API_ERROR;
			let status = 500;
			if (error.code === USER_ERRORS.USER_DOES_NOT_EXIST)
				status = 404;
			return res.status(status).json({error: error.code, reason: error.message});
		}
	});

	return router;
};

const USER_API_ERRORS = {
	USER_PERSONAL_INFO_NOT_FOUND: 'USER_PERSONAL_INFO_NOT_FOUND',
	UNKNOWN_USER_API_ERROR: 'UNKNOWN_USER_API_ERROR',
	BAD_REQUEST: 'BAD_REQUEST'
};
exports.USER_API_ERRORS = USER_API_ERRORS;