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

/**
 * Module dependencies.
 */

const http = require('http');
const crypto = require('crypto');
const request = require('request');
const async = require('async');
const Nano = require('nano');
const Agent = require('openssi-websdk').Agent;

const Helpers = require('../libs/helpers.js');
const Branding = require('../libs/branding.js');
const Users = require('../libs/users.js').Users;
const App = require('../app.js');

const Logger = require('../libs/logger.js').Logger;
if (process.env['LOG_LEVEL'])
	Logger.setLogLevel(process.env['LOG_LEVEL']);
const logger = Logger.makeLogger(Logger.logPrefix(__filename));

const required = [
	'DB_CONNECTION_STRING',
	'DB_USERS',
	'AGENT_NAME',
	'AGENT_PASSWORD',
	'FRIENDLY_NAME',
	'ACCOUNT_URL',
	'CARD_IMAGE_RENDERING',
	'CONNECTION_IMAGE_PROVIDER',
	'LOGIN_PROOF_PROVIDER',
	'SIGNUP_PROOF_PROVIDER',
	'SCHEMA_TEMPLATE_PATH'
];
for (const index in required) {
	if (!process.env[required[index]]) {
		throw new Error(`Missing environment parameter ${required[index]}`);
	}
}

// Pull required configuration parameters from environment variables
const ev = {
	DB_CONNECTION_STRING: process.env['DB_CONNECTION_STRING'],
	DB_USERS: process.env['DB_USERS'],
	ACCOUNT_URL: process.env['ACCOUNT_URL'],
	AGENT_NAME: process.env['AGENT_NAME'],
	AGENT_PASSWORD: process.env['AGENT_PASSWORD'],
	FRIENDLY_NAME: process.env['FRIENDLY_NAME'],
	AGENT_LOG_LEVEL: process.env.AGENT_LOG_LEVEL,
	AGENT_ADMIN_NAME: process.env['AGENT_ADMIN_NAME'],
	AGENT_ADMIN_PASSWORD: process.env['AGENT_ADMIN_PASSWORD'],
	CARD_IMAGE_RENDERING: process.env['CARD_IMAGE_RENDERING'],
	STATIC_CARD_FRONT_IMAGE: process.env['STATIC_CARD_FRONT_IMAGE'],
	STATIC_CARD_BACK_IMAGE: process.env['STATIC_CARD_BACK_IMAGE'],
	BRANDING_SERVER_ENDPOINT: process.env['BRANDING_SERVER_ENDPOINT'],
	BRANDING_SERVER_FRONT_TEMPLATE: process.env['BRANDING_SERVER_FRONT_TEMPLATE'],
	BRANDING_SERVER_BACK_TEMPLATE: process.env['BRANDING_SERVER_BACK_TEMPLATE'],
	MY_URL: process.env['MY_URL'],
	CONNECTION_IMAGE_PROVIDER: process.env.CONNECTION_IMAGE_PROVIDER,
	CONNECTION_ICON_PATH: process.env.CONNECTION_ICON_PATH,
	SESSION_SECRET: process.env['SESSION_SECRET'],
	LOGIN_PROOF_PROVIDER: process.env.LOGIN_PROOF_PROVIDER,
	LOGIN_PROOF_PATH: process.env.LOGIN_PROOF_PATH,
	SIGNUP_PROOF_PROVIDER: process.env.SIGNUP_PROOF_PROVIDER,
	SIGNUP_ACCOUNT_PROOF_PATH: process.env.SIGNUP_ACCOUNT_PROOF_PATH,
	SIGNUP_DMV_ISSUER_AGENT: process.env.SIGNUP_DMV_ISSUER_AGENT,
	SIGNUP_HR_ISSUER_AGENT: process.env.SIGNUP_HR_ISSUER_AGENT,
	SCHEMA_TEMPLATE_PATH: process.env.SCHEMA_TEMPLATE_PATH,
	ACCEPT_INCOMING_CONNECTIONS: process.env.ACCEPT_INCOMING_CONNECTIONS === 'true',
	ADMIN_API_USERNAME: process.env.ADMIN_API_USERNAME,
	ADMIN_API_PASSWORD: process.env.ADMIN_API_PASSWORD
};

for (const key in ev) {
	logger.debug(`${key}: ${ev[key]}`);
}

const port = normalizePort(process.env.PORT || '3000');

start().then(() => {
	logger.info('App started!');
}).catch((error) => {
	logger.error(`App failed to start: ${error}`);
	throw error;
});

async function start () {

	/*************************
	 * CONNECT TO THE DATABASE
	 *************************/
	// Retry parameters are configurable, but have default values
	const db_retries = process.env['DB_RETRIES'] ? parseInt(process.env['DB_RETRIES'], 10) : 20;
	if (typeof db_retries !== 'number' || isNaN(db_retries) || db_retries < 1)
		throw new Error('DB_RETRIES must be an integer >= 1');

	const db_retry_backoff_limit = process.env['DB_MAX_RETRY_INTERVAL'] ? parseInt(process.env['DB_MAX_RETRY_INTERVAL'], 10) : 30000;
	if (typeof db_retry_backoff_limit !== 'number' || isNaN(db_retry_backoff_limit) || db_retry_backoff_limit < 1000)
		throw new Error('DB_MAX_RETRY_INTERVAL must be an integer >= 1000 representing milliseconds');

	// Without this, sometimes the couchdb container doesn't come up in time and the other containers crash
	await wait_for_url(ev.DB_CONNECTION_STRING, db_retries, db_retry_backoff_limit);

	const nano = Nano(ev.DB_CONNECTION_STRING);

	// Create the database if it doesn't exist already
	const db = await new Promise((resolve, reject) => {
		logger.info(`Attempting to create database ${ev.DB_USERS}`);
		nano.db.create(ev.DB_USERS, (error) => {
			if (error && error.toString().toLowerCase().indexOf('exists') >= 0) {
				logger.info(`Database already exists.  We're good: ${error}`);
				resolve(nano.use(ev.DB_USERS));

			} else if (error) {
				logger.error(`Failed to create database: ${error}`);
				reject(error);

			} else {
				logger.info(`Created database ${ev.DB_USERS}`);
				resolve(nano.use(ev.DB_USERS));
			}
		});
	});

	// Setup our user account management and publish user index functions to the database
	const users = new Users(db);
	await users.publish_design_doc();

	/*************************
	 * CONNECT TO THE AGENT
	 *************************/
	const agent_retries = process.env['AGENT_RETRIES'] ? parseInt(process.env['AGENT_RETRIES'], 10) : 20;
	if (typeof agent_retries !== 'number' || isNaN(agent_retries) || agent_retries < 1)
		throw new Error('AGENT_RETRIES must be an integer >= 1');

	const agent_retry_backoff_limit = process.env['AGENT_MAX_RETRY_INTERVAL'] ? parseInt(process.env['AGENT_MAX_RETRY_INTERVAL'], 10) : 30000;
	if (typeof agent_retry_backoff_limit !== 'number' || isNaN(agent_retry_backoff_limit) || agent_retry_backoff_limit < 1000)
		throw new Error('AGENT_MAX_RETRY_INTERVAL must be an integer >= 1000 representing milliseconds');

	const account_health_url = ev.ACCOUNT_URL.endsWith('/') ? ev.ACCOUNT_URL + 'health' : ev.ACCOUNT_URL + '/health';
	await wait_for_url(account_health_url, agent_retries, agent_retry_backoff_limit);

	// Generally, you won't have to wait for your agent, so the above is optional
	const agent = new Agent(ev.ACCOUNT_URL, ev.AGENT_NAME, ev.AGENT_PASSWORD, ev.FRIENDLY_NAME);
	agent.setLoggingLevel(ev.AGENT_LOG_LEVEL ? ev.AGENT_LOG_LEVEL : 'info');

	let agent_info;
	try {
		logger.info(`Testing agent credentials by getting agent ${ev.AGENT_NAME}'s identity info`);
		agent_info = await agent.getIdentity();
		logger.info('Agent initialized');

	} catch (error) {
		logger.error(`Failed to get ${ev.AGENT_NAME} info: ${error}`);

		if (ev.AGENT_ADMIN_NAME && ev.AGENT_ADMIN_PASSWORD) {

			try {
				logger.info(`Creating agent ${ev.AGENT_NAME} if it does not exist.  May take a while.`);
				agent_info = await agent.createIdentity(ev.AGENT_ADMIN_NAME, ev.AGENT_ADMIN_PASSWORD);
			} catch (error) {
				logger.error(`Failed to create agent ${ev.AGENT_NAME}.  It may already exist: ${error}`);
			}

		} else {
			process.exit(1);
		}
	}

	if (!agent_info || agent_info.role !== 'TRUST_ANCHOR') {
		if (ev.AGENT_ADMIN_NAME && ev.AGENT_ADMIN_PASSWORD) {
			try {
				logger.info(`Onboarding ${ev.AGENT_NAME} as trust anchor`);
				agent_info = await agent.onboardAsTrustAnchor(ev.AGENT_ADMIN_NAME, ev.AGENT_ADMIN_PASSWORD);
				logger.info(`${ev.AGENT_NAME} is now a trust anchor`);
			} catch (error) {
				logger.error(`Failed to registery ${ev.AGENT_NAME} as a trust anchor: ${error}`);
				process.exit(1);
			}
		} else {
			logger.error(`Agent ${ev.AGENT_NAME} must be a trust anchor!`);
			process.exit(1);
		}
	}

	logger.debug(`Agent user data: ${JSON.stringify(agent_info)}`);

	/*************************
	 * SETUP CREDENTIAL RENDERING
	 *************************/
	// Renderers will be injected in code that issues credentials
	let card_renderer;
	if (ev.CARD_IMAGE_RENDERING === 'static') {

		logger.info('Setting up static credential rendering');
		if (!ev.STATIC_CARD_FRONT_IMAGE || !ev.STATIC_CARD_BACK_IMAGE)
			throw new Error('STATIC_CARD_FRONT_IMAGE and STATIC_CARD_BACK_IMAGE must be provided for static card rendering');
		card_renderer = new Branding.PlaceHolderBrander(ev.STATIC_CARD_FRONT_IMAGE, ev.STATIC_CARD_BACK_IMAGE);

	} else if (ev.CARD_IMAGE_RENDERING === 'branding_server') {

		if (!ev.BRANDING_SERVER_ENDPOINT || !ev.BRANDING_SERVER_FRONT_TEMPLATE || !ev.BRANDING_SERVER_BACK_TEMPLATE)
			throw new Error('BRANDING_SERVER_ENDPOINT, BRANDING_SERVER_FRONT_TEMPLATE, and BRANDING_SERVER_BACK_TEMPLATE' +
				' must be set to use branding_server rendering');

		// Wait for the branding server to be ready
		logger.info(`Setting up credential rendering for branding server ${ev.BRANDING_SERVER_ENDPOINT}`);
		const branding_server_retries = process.env['BRANDING_SERVER_RETRIES'] ? parseInt(process.env['BRANDING_SERVER_RETRIES'], 10) : 20;
		if (typeof branding_server_retries !== 'number' || isNaN(branding_server_retries) || branding_server_retries < 1)
			throw new Error('BRANDING_SERVER_RETRIES must be an integer >= 1');

		const branding_server_max_retry_interval = process.env['BRANDING_SERVER_MAX_RETRY_INTERVAL'] ? parseInt(process.env['BRANDING_SERVER_MAX_RETRY_INTERVAL'], 10) : 30000;
		if (typeof branding_server_max_retry_interval !== 'number' || isNaN(branding_server_max_retry_interval) || branding_server_max_retry_interval < 1000)
			throw new Error('BRANDING_SERVER_MAX_RETRY_INTERVAL must be an integer >= 1000 representing milliseconds');
		await wait_for_url(ev.BRANDING_SERVER_ENDPOINT, branding_server_retries, branding_server_max_retry_interval);
		card_renderer = new Branding.BrandingServerRenderer(ev.BRANDING_SERVER_ENDPOINT, ev.BRANDING_SERVER_FRONT_TEMPLATE, ev.BRANDING_SERVER_BACK_TEMPLATE);

	} else if (ev.CARD_IMAGE_RENDERING === 'none') {

		logger.info('Credential rendering is disabled');
		card_renderer = new Branding.NullRenderer();

	} else {
		throw new Error(`Invalid card rendering setting: ${ev.CARD_IMAGE_RENDERING}`);
	}

	/*************************
	 * CONNECTION IMAGE RENDERING
	 *************************/
	// Providers will be injected in code that establishes connections
	let connection_icon_provider;
	if (ev.CONNECTION_IMAGE_PROVIDER === 'static') {
		if (!ev.CONNECTION_ICON_PATH)
			throw new Error('CONNECTION_ICON_PATH must be set in order to use `static` CONNECTION_IMAGE_PROVIDER');

		logger.debug(`Setting up connection icon rendering with file ${ev.CONNECTION_ICON_PATH}`);
		connection_icon_provider = new Branding.StaticFileImageProvider(ev.CONNECTION_ICON_PATH);
	} else if (ev.CONNECTION_IMAGE_PROVIDER === 'none') {

		logger.debug('Connection icon rendering is disabled');
		connection_icon_provider = new Branding.NullImageProvider();
	} else {
		throw new Error(`Invalid value for CONNECTION_IMAGE_PROVIDER: ${ev.CONNECTION_IMAGE_PROVIDER}`);
	}

	/*************************
	 * VERIFICATION/PROOF SETUP
	 *************************/
	let login_proof_helper;
	if (ev.LOGIN_PROOF_PROVIDER === 'file') {

		logger.info(`Setting up file based login proof handling: ${ev.LOGIN_PROOF_PATH}`);
		login_proof_helper = new Helpers.LoginHelper(ev.LOGIN_PROOF_PATH);

	} else if (ev.LOGIN_PROOF_PROVIDER === 'none') {

		logger.info('Login proof handling is disabled');
		login_proof_helper = new Helpers.NullProofHelper(false);

	} else {
		throw new Error(`Invalid value for LOGIN_PROOF_PROVIDER: ${ev.LOGIN_PROOF_PROVIDER}`);
	}

	let signup_helper;
	if (ev.SIGNUP_PROOF_PROVIDER === 'account') {
		if (!ev.SIGNUP_ACCOUNT_PROOF_PATH)
			throw new Error('SIGNUP_ACCOUNT_PROOF_PATH must be set in order to use `account` SIGNUP_PROOF_PROVIDER');
		if (!ev.SIGNUP_DMV_ISSUER_AGENT)
			throw new Error('SIGNUP_DMV_ISSUER_AGENT must be set in order to use `account` SIGNUP_PROOF_PROVIDER');
		if (!ev.SIGNUP_HR_ISSUER_AGENT)
			throw new Error('SIGNUP_HR_ISSUER_AGENT must be set in order to use `account` SIGNUP_PROOF_PROVIDER');
		logger.info(`${ev.SIGNUP_PROOF_PROVIDER} signup proof selected.  Proof request path: ${ev.SIGNUP_ACCOUNT_PROOF_PATH}`);
		signup_helper = new Helpers.AccountSignupHelper(ev.SIGNUP_HR_ISSUER_AGENT, ev.SIGNUP_DMV_ISSUER_AGENT, ev.SIGNUP_ACCOUNT_PROOF_PATH, agent);
		await signup_helper.cleanup();
		await signup_helper.setup();

	} else if (ev.SIGNUP_PROOF_PROVIDER === 'none') {
		logger.info('VC signups will be disabled');
	} else {
		throw new Error(`Invalid value for SIGNUP_PROOF_PROVIDER: ${ev.SIGNUP_PROOF_PROVIDER}`);
	}

	if (ev.ACCEPT_INCOMING_CONNECTIONS) {
		logger.info(`Listening for and accepting connection, credential and verification requests to my agent, ${agent.name}`);
		const responder = new Helpers.ConnectionResponder(agent);
		responder.start();
	} else {
		logger.info(`Not listening for connection offers to my agent, ${agent.name}`);
	}

	/*************************
	 * Make sure admin api info makes sense
	 *************************/
	if (!ev.ADMIN_API_PASSWORD && !ev.ADMIN_API_USERNAME) {
		logger.warn('No admin API username or password set.  Admin APIs will be WIDE OPEN');
	} else if (ev.ADMIN_API_PASSWORD && ev.ADMIN_API_USERNAME) {
		logger.info('ADMIN APIS ARE PROTECTED');
	} else {
		throw new Error('You must provide both ADMIN_API_USERNAME and ADMIN_API_PASSWORD, not just one or the other');
	}

	/*************************
	 * START THE APP
	 *************************/
	// Just keep the session fairly unique
	const hash = crypto.createHash('sha256');
	hash.update(ev.ACCOUNT_URL + ev.AGENT_NAME + ev.MY_URL);
	ev.SESSION_SECRET = ev.SESSION_SECRET ? ev.SESSION_SECRET : hash.digest('hex');
	const app = App(ev, nano, agent, card_renderer, users, connection_icon_provider, login_proof_helper, signup_helper);

	// Get port from environment and store in Express.
	app.set('port', port);

	// Create HTTP server.
	const server = http.createServer(app);

	// Listen on provided port, on all network interfaces.
	server.listen(port);
	server.on('error', onError);
	server.on('listening', () => {
		const addr = server.address();
		const bind = typeof addr === 'string'
			? 'pipe ' + addr
			: 'port ' + addr.port;
		logger.info('Listening on ' + bind);
	});
}

/**
 * Normalize a port into a number, string, or false.
 * @param {string|number} val A port value.
 * @returns {string|number} A number if the value is a positive, parseable integer, a string if it is negative, false otherwise
 */
function normalizePort (val) {
	const port = parseInt(val, 10);

	if (isNaN(port)) {
		// named pipe
		return val;
	}

	if (port >= 0) {
		// port number
		return port;
	}

	return false;
}

/**
 * Event listener for HTTP server "error" event.
 * @param {Error} error An error associated with a HTTP server.
 * @returns {void}
 */
function onError (error) {
	if (error.syscall !== 'listen') {
		throw error;
	}

	const bind = typeof port === 'string'
		? 'Pipe ' + port
		: 'Port ' + port;

	// handle specific listen errors with friendly messages
	switch (error.code) {
	case 'EACCES':
		logger.error(bind + ' requires elevated privileges');
		process.exit(1);
		break;
	case 'EADDRINUSE':
		logger.error(bind + ' is already in use');
		process.exit(1);
		break;
	default:
		throw error;
	}
}

/**
 * Attempts to connect to a given URL a given number of times before giving up.  The time between each attempt is
 * is random, with the upper limit of each timeout increasing exponentially with the number of attempts, up to a given
 * maximum interval limit.
 * @param {string} url A URL to a server.
 * @param {number} max_attempts The number of attempts to make before giving up.
 * @param {number} max_backoff_period The maximum number of milliseconds to backoff after each attempt.
 * @return {Promise<*>} A promise that resolves if the url was contacted successfully, or rejects if it was not.
 */
async function wait_for_url (url, max_attempts, max_backoff_period) {

	if (!url || typeof url !== 'string')
		throw new TypeError('URL must be a string');
	if (typeof max_attempts !== 'number' || !Number.isInteger(max_attempts) || max_attempts < 1)
		throw new TypeError('Maximum number of attempts must be an integer >= 1');
	if (typeof max_backoff_period !== 'number' || !Number.isInteger(max_backoff_period) || max_backoff_period < 0)
		throw new TypeError('Max backoff period must be an integer >= 0');

	return new Promise((resolve, reject) => {

		const retry_opts = {
			times: max_attempts,
			interval: function (retryCount) {
				const backoff = Math.random() * Math.min(100 * Math.pow(2, retryCount), max_backoff_period);
				logger.debug(`Will attempt to ping ${url} again in ${Number.parseFloat(backoff / 1000.0).toFixed(2)} seconds`);
				return backoff;
			}
		};

		let attempts = 0;
		async.retry(retry_opts, (callback) => {

			logger.info(`Connecting to ${url}.  Attempt ${++attempts} out of ${max_attempts}`);
			request({url: url, method: 'HEAD'}, (error, response, body) => {
				if (error) {
					logger.info('Could not connect, sleeping...');
					logger.debug(`Connection attempt error: ${error}`);
					return callback(error);
				}

				if (response.statusCode >= 300) {
					logger.info(`Connected but got invalid response code: ${response.statusCode}`);
					logger.debug(`Full response: ${JSON.stringify(response)}`);
					return callback(new Error(`Invalid response code ${response.statusCode}`));
				}

				logger.info(`Connected to ${url}`);
				logger.debug(`Connection response: ${JSON.stringify(response)}`);
				callback(null, body);
			});
		}, (error, result) => {
			if (error) {
				logger.error(`Failed to connect to ${url}: ${error}`);
				return reject(`Connection to ${url} failed: ${error}`);
			}

			resolve ();
		});
	});
}
