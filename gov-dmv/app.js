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

const createError = require('http-errors');
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const session = require('express-session');

const IssuanceManager = require('./libs/credentials.js').IssuanceManager;
const LoginManager = require('./libs/logins.js').LoginManager;
const SignupManager = require('./libs/signups.js').SignupManager;

const Middleware = require('./routes/middleware.js').Middleware;
const UserUI = require('./routes/ui.js');
const LoginAPI = require('./routes/logins.js');
const SignupAPI = require('./routes/signups.js');
const UserAPI = require('./routes/users_api.js');
const SchemaAPI = require('./routes/schemas_api.js');
const CredDefsAPI = require('./routes/cred_def_api.js');
const CredentialsAPI = require('./routes/credentials_api.js');

// Logging setup
const Logger = require('./libs/logger.js').Logger;
const logger = Logger.makeLogger(Logger.logPrefix(__filename));

/**
 * Assembles all the libraries and routers for the application into an express webapp.
 * @param {object} ev Configuration parameters for the webapp.
 * @param {object} nano A nano instance configured with a valid couchdb connection string.
 * @param {Agent} agent An Agent instance of openssi-websdk.
 * @param {CardRenderer} card_renderer The service this app will use for rendering card images.
 * @param {Users} users An account management service.
 * @param {ImageProvider} connection_icon_provider Supplies this app's "profile pic" when connecting to other agents.
 * @param {ProofHelper} login_proof_helper Provides proof schemas for the VC login flows.
 * @param {SignupHelper} [signup_helper] Manages proof schemas and user record creation.
 * @return {object} An express webapp that can be attached to an http server.
 */
function createApp (ev, nano, agent, card_renderer, users, connection_icon_provider, login_proof_helper, signup_helper) {

	// Set up the express app that will serve up our web pages and APIs
	logger.debug('Setting up express app');
	const app = express();

	// view engine setup
	app.set('views', path.join(__dirname, 'views'));
	app.set('view engine', 'pug');

	app.use(morgan('dev'));
	app.use(express.json());
	app.use(express.urlencoded({extended: false}));
	app.use(express.static(path.join(__dirname, 'public')));
	app.use(session({
		secret: ev.SESSION_SECRET,
		resave: false,
		saveUninitialized: false,
		cookie: {
			expires: 600000
		}
	}));

	// Set up all the backend libraries for managing users, schemas, credentials, etc.
	const issuance_manager = new IssuanceManager(agent, users, card_renderer, connection_icon_provider);
	const login_manager = new LoginManager(agent, users, connection_icon_provider, login_proof_helper);
	let signup_manager;
	if (signup_helper)
		signup_manager = new SignupManager(agent, users, card_renderer, connection_icon_provider, signup_helper);

	// Setup authentication middleware
	const middleware = new Middleware(ev.ADMIN_API_USERNAME, ev.ADMIN_API_PASSWORD, ev.FRIENDLY_NAME);

	// UI routers
	app.use('/', UserUI.createRouter(users, ev, middleware));
	app.use('/', LoginAPI.createRouter(users, login_manager));
	if (signup_helper)
		app.use('/', SignupAPI.createRouter(signup_manager));

	// API routers
	app.use('/api', UserAPI.createRouter(users, agent, middleware));
	app.use('/api', SchemaAPI.createRouter(agent, ev.SCHEMA_TEMPLATE_PATH, middleware));
	app.use('/api', CredDefsAPI.createRouter(agent, middleware));
	app.use('/api', CredentialsAPI.createRouter(issuance_manager, middleware));

	// catch 404 and forward to error handler
	app.use((req, res, next) => {
		next(createError(404));
	});

	// error handler
	app.use((err, req, res, next) => {
		res.status(err.status || 500);
		res.json({error: err.status === 404 ? 'NOT_FOUND' : 'UNKNOWN_ERROR', reason: err.message});
	});

	return app;
}

module.exports = createApp;

