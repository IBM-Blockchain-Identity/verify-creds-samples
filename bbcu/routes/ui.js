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
 * Creates an express router for displaying all the web pages a user can browse to.
 * @param {object} users_instance An instance of the Users class with a backend user database.
 * @param {object} ev Information about the app to pass to the UI.
 * @param {Middleware} middleware Authentication middleware used to protect API endpoints.
 * @returns {object} An express router for the users API.
 */
exports.createRouter = function (users_instance, ev, middleware) {

	const router = express.Router();
	router.use(bodyParser.urlencoded({extended: true}));
	router.use(bodyParser.json());
	router.use(bodyParser.text());
	router.use(compression());

	// Root redirects you to the login screen
	router.get('/', (req, res, next) => {
		res.redirect('/login');
	});

	// Status url for monitoring
	router.get('/status', (req, res, next) => {
		res.json({
			message: 'BBCU is running',
			status: 'OK'
		});
	});

	// Agent invitation
	router.get('/invitation', (req, res, next) => {
		res.json({
			url: ev.AGENT_INVITATION_URL,
		});
	});

	// Login options page
	router.get('/login', (req, res, next) => {
		if (req.session && req.session.user_id) {
			res.redirect('/logout');
		} else {
			res.render('login', {title: 'BBCU Online Banking'});
		}
	});

	// Admin dashboard
	router.get('/admin', [ middleware.is_admin ], (req, res, next) => {
		res.render('admin', {title: 'Admin Dashboard'});
	});

	// Edit info for a single user
	router.get('/users/:user_id/edit', [ middleware.is_admin ], async (req, res, next) => {
		const user_id = req.params.user_id;
		try {
			const user_doc = await users_instance.read_user(user_id);
			res.render('user_edit', {title: 'Edit User', user_id: user_id, user_doc: user_doc});

		} catch (error) {
			let status = 500;
			if (error.code === USER_ERRORS.USER_DOES_NOT_EXIST)
				status = 404;
			return res.status(status).send({error: error.code, reason: error.message});
		}
	});

	// View the account page for a specific user
	router.get('/account', [ middleware.user_authentication ], async (req, res, next) => {
		const user_id = req.session.user_id;
		try {
			const user_doc = await users_instance.read_user(user_id);
			res.render('account', {title: 'My Account', user_id: user_id, user_doc: user_doc});

		} catch (error) {
			let status = 500;
			if (error.code === USER_ERRORS.USER_DOES_NOT_EXIST)
				status = 404;
			return res.status(status).send({error: error.code, reason: error.message});
		}
	});

	return router;
};
