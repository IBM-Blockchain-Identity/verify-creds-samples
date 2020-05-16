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

const bcrypt = require('bcrypt');

const users_design_doc = require('./design_docs/users.json');
const DESIGN_DOC = users_design_doc._id.split('/')[1];
const VIEW_USERS = 'users';
const VIEW_ACCOUNTS = 'accounts';

const Logger = require('./logger.js').Logger;
const logger = Logger.makeLogger(Logger.logPrefix(__filename));

class Users {

	/**
	 * Constructs a Users instance that will manage users in the given database.
	 * @param {object} usersDB A nano database instance representing a user database.
	 */
	constructor (usersDB) {
		if (!usersDB || typeof usersDB !== 'object' || typeof usersDB.get !== 'function')
			throw new TypeError('Users database was not a nano database instance');

		this.usersDB = usersDB;
	}

	/**
	 * Publishes the couchdb design doc for managing users
	 * @return {Promise<void>} A promise that resolves when the design doc is updated and rejects otherwise.
	 */
	async publish_design_doc () {

		// Don't pollute other instances of Users' design docs
		const design_doc = JSON.parse(JSON.stringify(users_design_doc));

		// Strip the _rev initially so we don't get conflicts if the doc is new
		if (design_doc._rev)
			delete design_doc._rev;

		logger.info('Publishing Users design doc');
		try {
			const existing_doc = await this.usersDB.get(design_doc._id);
			design_doc._rev = existing_doc._rev;
		} catch (error) {
			// If the document is missing, we'll get an error that we don't need to handle.  We'll just create it.
		}

		try {
			const response = await this.usersDB.insert(design_doc, null);
			logger.debug(`Users design doc published. rev: ${response.rev}`);
		} catch (error) {
			logger.error(`Failed to publish Users design doc: ${error}`);
			error.code = USERS_ERRORS.DESIGN_DOC_PUBLISHING_FAILURE;
			throw error;
		}
	}

	/**
	 * Extensible fields for a user record.  These are just examples.
	 * @typedef {object} UserOpts
	 * @property {string} [agent_name] An Agent Name for connecting to the user.
	 * @property {string} [invitation_url] An Invitation URL for connectin to the user.
	 * @property {string} [did] A DID for connecting to the user.
	 */

	/**
	 * Describes a user record.
	 * @typedef {object} User
	 * @property {string} _id The ID for the user record.  Generally the same as the email.
	 * @property {string} email The username for the user.
	 * @property {string} password The hashed and salted password for the user.
	 * @property {string} type Allows for our index to distinguish between non-user and user docs in the database.
	 * @property {object} [personal_info] A list of key/value pairs containing data that could be used to issue a credential.
	 * @property {UserOpts} [opts] Additions to the user doc can go here.  Makes user records more extensible without library changes.
	 */

	/**
	 * Creates a new user.
	 * @param {string} username The user's name.  Should be an email address.
	 * @param {string} password The new user's password.  Will be hashed using bcrypt.
	 * @param {object} [personal_info] An object containing attributes about the user.
	 * @param {UserOpts} [opts] Optional additional information that can be added to the user doc.  For example, passing
	 * in {first_login: 'today'} will result in a `first_login` field being added to the user doc.
	 * @returns {Promise<User>} A promise that resolves with the contents of the created user record.
	 */
	async create_user (username, password, personal_info, opts) {
		if (!username || typeof username !== 'string')
			throw new TypeError('New user\'s username was not a non-empty string');
		// if this is a mobile user scanning a QR code, may not have a password, yet
		if ((!opts || !opts.mobile_user) && typeof password !== 'string')
			throw new TypeError('New user\'s password must be a string');
		if ([ 'undefined', 'null', 'object' ].indexOf(typeof personal_info) < 0)
			throw new TypeError('New user\'s personal info was an invalid type');
		if ([ 'undefined', 'null', 'object' ].indexOf(typeof opts) < 0)
			throw new TypeError('New user\'s optional fields list was an invalid type');

		let hash = null;
		if (password) {
			try {
				hash = await bcrypt.hash(password, 10);
			} catch (error) {
				logger.error(`User password could not be hashed: ${error}`);
				error.code = error.code ? error.code : USERS_ERRORS.USER_CREATION_FAILURE;
				throw error;
			}
		}

		const userDoc = {
			_id: username,
			email: username,
			password: hash,
			type: 'user'
		};
		if (personal_info)
			userDoc.personal_info = personal_info;
		if (opts)
			userDoc.opts = opts;

		logger.info(`Creating user ${username}`);
		try {
			const new_user = await this.usersDB.insert(userDoc, null);
			logger.info(`Created user record ${new_user.id}`);
			delete userDoc.password;
			return userDoc;

		} catch (error) {
			logger.error(`Failed to create user ${username}: ${error}`);
			if (error.message.indexOf('update conflict') >= 0)
				error.code = USERS_ERRORS.USER_ALREADY_EXISTS;
			else
				error.code = USERS_ERRORS.USER_CREATION_FAILURE;
			throw error;
		}
	}

	/**
	 * Retrieves the given user's database record.
	 * @param {string} username The email for a user.
	 * @returns {Promise<User>} A promise that resolves with the user record.
	 */
	async read_user (username) {
		if (!username || typeof username !== 'string')
			throw new TypeError('Read user username was not a non-empty string');

		logger.info(`Reading user ${username}`);
		let doc;
		try {
			const view_resp = await this.usersDB.view(DESIGN_DOC, VIEW_USERS, {reduce: false, include_docs: true, keys: [ username ]});
			for (const index in view_resp.rows) {
				const current_doc = view_resp.rows[index].doc;
				if (current_doc._id === username) {
					doc = current_doc;
					break;
				}
			}
		} catch (error) {
			logger.error(`Failed to read user: ${error}`);
			error.code = USERS_ERRORS.UNKNOWN_USER_READ_FAILURE;
			throw error;
		}

		if (!doc) {
			const error = new Error(`User ${username} could not be found in the user list`);
			logger.error(`Failed to find user: ${error}`);
			error.code = USERS_ERRORS.USER_DOES_NOT_EXIST;
			throw error;
		}

		logger.info(`Read user ${username}`);
		delete doc.password;
		logger.debug(`User ${username}'s user doc: ${JSON.stringify(doc)}`);
		return doc;
	}

	/**
	 * Retrieves all the user records
	 * @returns {Promise<Users>} A promise that resolves with a list of all users.
	 */
	async read_users () {

		logger.info('Reading all users');
		try {
			const view_resp = await this.usersDB.view(DESIGN_DOC, VIEW_USERS, {reduce: false, include_docs: true});
			// Translate couchdb view response into a list of user docs
			const users = {};
			for (const index in view_resp.rows) {
				const doc = view_resp.rows[index].doc;
				delete doc.password;
				users[doc._id] = doc;
			}
			logger.info(`Successfully read all ${Object.keys(users).length} users`);
			return users;

		} catch (error) {
			logger.error(`Failed to read all users: ${error}`);
			error.code = USERS_ERRORS.UNKNOWN_USER_READ_FAILURE;
			throw error;
		}
	}

	/**
	 * Updates an existing user's personal information.
	 * @param {string} username The email of the user to update.
	 * @param {object} personal_info An object representing a new set of personal info for a user.
	 * @param {UserOpts} [opts] An update list of extensible fields for the user record.
	 * @returns {Promise<User>} A promise that resolves with the updated user record.
	 */
	async update_user (username, personal_info, opts) {
		if (!username || typeof username !== 'string')
			throw new TypeError('Update user username was not a non-empty string');
		if ([ 'undefined', 'null', 'object' ].indexOf(typeof personal_info) < 0)
			throw new TypeError('Update user personal info had an invalid type');
		if ([ 'undefined', 'null', 'object' ].indexOf(typeof opts) < 0)
			throw new TypeError('Update user opts had an invalid type');

		logger.info(`Updating user ${username}`);
		let userdoc;
		try {
			const docs = await this.usersDB.view(DESIGN_DOC, VIEW_USERS, {reduce: false, include_docs: true, keys: [ username ]});
			for (const index in docs.rows) {
				if (docs.rows[index].key === username)
					userdoc = docs.rows[index].doc;
			}
		} catch (error) {
			logger.error(`Failed to get user list: ${error}`);
			error.code = USERS_ERRORS.UNKNOWN_USER_UPDATE_FAILURE;
			throw error;
		}
		if (!userdoc) {
			const error = new Error('User doc was not found in the database');
			logger.error(`Cannot update user ${username}: ${error}`);
			error.code = USERS_ERRORS.USER_DOES_NOT_EXIST;
			throw error;
		}

		if (personal_info && Object.keys(personal_info).length > 0)
			userdoc.personal_info = personal_info;
		else
			delete userdoc.personal_info;
		if (opts && Object.keys(opts).length > 0)
			userdoc.opts = opts;
		else
			delete userdoc.opts;

		try {
			await this.usersDB.insert(userdoc, null);
			delete userdoc._rev;

			logger.debug(`Updated user ${username}`);
			delete userdoc.password;
			return userdoc;

		} catch (error) {
			logger.error(`Failed to update user ${username}: ${error}`);
			error.code = USERS_ERRORS.UNKNOWN_USER_UPDATE_FAILURE;
			throw error;
		}
	}

	/**
	 * Deletes a given user.
	 * @param {string} username The email address for the user we want to delete.
	 * @returns {Promise<string>} A promise that resolves with the user ID once the user record is destroyed.
	 */
	async delete_user (username) {
		if (!username || typeof username !== 'string')
			throw new TypeError('Delete user username was not a non-empty string');

		logger.info(`Deleting user ${username}`);
		let userdoc;
		try {
			const docs = await this.usersDB.view(DESIGN_DOC, VIEW_USERS, {
				reduce: false,
				include_docs: true,
				keys: [ username ]
			});
			for (const index in docs.rows) {
				if (docs.rows[index].key === username)
					userdoc = docs.rows[index].doc;
			}

		} catch (error) {
			logger.error(`Failed to get user list: ${error}`);
			error.code = USERS_ERRORS.UNKNOWN_USER_REMOVAL_FAILURE;
			throw error;
		}
		if (!userdoc) {
			const error = new Error('User doc was not found in the database');
			logger.error(`Failed to delete user ${username}: ${error}`);
			error.code = USERS_ERRORS.USER_DOES_NOT_EXIST;
			throw error;
		}

		try {
			await this.usersDB.destroy(userdoc._id, userdoc._rev);
			logger.info(`Deleted user ${username}`);
			return username;

		} catch (error) {
			logger.error(`Failed to delete user ${username}: ${error}`);
			error.code = USERS_ERRORS.UNKNOWN_USER_REMOVAL_FAILURE;
			throw error;
		}
	}

	/**
	 * Checks the given password against the user record.
	 * @param {string} id A user ID.
	 * @param {string} password A password to check.
	 * @return {Promise<boolean>} A promise that resolves to true if the password is valid, false otherwise.
	 */
	async checkPassword (id, password) {
		if (!id || typeof id !== 'string')
			throw new TypeError('Invalid user ID');
		if (!password || typeof password !== 'string')
			throw new TypeError('Invalid password');

		let doc;
		try {
			const view_resp = await this.usersDB.view(DESIGN_DOC, VIEW_USERS, {reduce: false, include_docs: true, keys: [ id ]});
			for (const index in view_resp.rows) {
				const current_doc = view_resp.rows[index].doc;
				if (current_doc._id === id) {
					doc = current_doc;
					break;
				}
			}
		} catch (error) {
			logger.error(`Failed to read user: ${error}`);
			error.code = USERS_ERRORS.UNKNOWN_USER_READ_FAILURE;
			throw error;
		}

		if (!doc) {
			const error = new Error(`User ${id} could not be found in the user list`);
			logger.error(`Failed to find user: ${error}`);
			error.code = USERS_ERRORS.USER_DOES_NOT_EXIST;
			throw error;
		}

		// Passwords are stored as bcrypted hashes
		return bcrypt.compare(password, doc.password);
	}

	/**
	 * Retrieves the given user's database record.
	 * @param {string} account_number The account number for a user.
	 * @returns {Promise<User>} A promise that resolves with the user record.
	 */
	async read_user_from_account (account_number) {
		if (!account_number || typeof account_number !== 'string')
			throw new TypeError('Read user username was not a non-empty string');

		logger.info(`Reading user from account ${account_number}`);
		let doc;
		try {
			//const view_resp = await this.usersDB.view(DESIGN_DOC, VIEW_ACCOUNTS, {reduce: false, include_docs: true, keys: [ account_number ]});
			const view_resp = await this.usersDB.view(DESIGN_DOC, VIEW_ACCOUNTS, {reduce: false, include_docs: true});
			for (const index in view_resp.rows) {
				const current_doc = view_resp.rows[index].doc;
				if (current_doc && current_doc.personal_info && current_doc.personal_info.account_number === account_number) {
					doc = current_doc;
					break;
				}
			}
		} catch (error) {
			logger.error(`Failed to read user: ${error}`);
			error.code = USERS_ERRORS.UNKNOWN_USER_READ_FAILURE;
			throw error;
		}

		if (!doc) {
			const error = new Error(`Account ${account_number} could not be found in the user list`);
			logger.error(`Failed to find user: ${error}`);
			error.code = USERS_ERRORS.USER_DOES_NOT_EXIST;
			throw error;
		}

		logger.info(`Read user from account ${account_number}`);
		delete doc.password;
		logger.debug(`Account number ${account_number}'s user doc: ${JSON.stringify(doc)}`);
		return doc;
	}
}

exports.Users = Users;

const USERS_ERRORS = {
	DESIGN_DOC_PUBLISHING_FAILURE: 'DESIGN_DOC_PUBLISHING_FAILURE',
	USER_CREATION_FAILURE: 'USER_CREATION_FAILURE',
	UNKNOWN_USER_READ_FAILURE: 'UNKNOWN_USER_READ_FAILURE',
	UNKNOWN_USER_REMOVAL_FAILURE: 'UNKNOWN_USER_REMOVAL_FAILURE',
	UNKNOWN_USER_UPDATE_FAILURE: 'UNKNOWN_USER_UPDATE_FAILURE',
	USER_TI_ASSOCIATION_FAILURE: 'USER_TI_ASSOCIATION_FAILURE',
	USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',
	USER_DOES_NOT_EXIST: 'USER_DOES_NOT_EXIST'
};

exports.USERS_ERRORS = USERS_ERRORS;