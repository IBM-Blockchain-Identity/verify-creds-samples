/**
 © Copyright IBM Corp. 2020

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

// Logging setup
const Logger = require('../libs/logger.js').Logger;
const logger = Logger.makeLogger(Logger.logPrefix(__filename));

/**
 * Creates an express router for all the REST endpoints related to logging in and out of the app.
 * @param {Agent} agent An agent instance associated with this web app.
 * @returns {object} An express router for the login API.
 */
exports.createRouter = function (agent, connection_icon_provider) {

	this.connection_icon_provider = connection_icon_provider

	if (!agent || typeof agent.getCredentialDefinitions !== 'function')
		throw new TypeError('Agent API was not given an Agent');

	const router = express.Router();
	router.use(bodyParser.urlencoded({extended: true}));
	router.use(bodyParser.json());
	router.use(bodyParser.text());
	router.use(compression());

	/* Get the status of the current signup flow */
	router.get('/agentinfo', [], async (req, res) => {
		const invitations = await agent.getInvitations({'max_acceptances': '-1'});
		let autoAcceptInvitation = null;
		if (!invitations) {
			logger.error("unexpected error: getInvitations returned nothing");
			res.status(500).json({ message: "unexpected error: getInvitations returned nothing" });
		}
		for (let i = 0; i < invitations.length; i++) {
			const invitation = invitations[i];
			if (invitation.manual_accept === false && invitation.properties && !!invitation.properties.icon) {
				autoAcceptInvitation = invitation;
				break;
			}
		}
		if (!autoAcceptInvitation) {
			const icon = await connection_icon_provider.getImage();
			invitation = await agent.createInvitation(true, false, -1, {icon: icon});
		} else {
			invitation = autoAcceptInvitation;
		}
		res.status(200).json({agent: {url: agent.url, name: agent.name, user: agent.user, invitation_url: invitation.url}});
	});

	return router;
};

const AGENT_API_ERRORS = {
	MISSING_REQUIRED_PARAMETERS: 'MISSING_REQUIRED_PARAMETERS'
};

exports.AGENT_API_ERRORS = AGENT_API_ERRORS;