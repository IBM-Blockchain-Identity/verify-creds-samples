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

const Agent = require('openssi-websdk').Agent;

// Logging setup
const Logger = require('./libs/logger.js').Logger;
const logger = Logger.makeLogger(Logger.logPrefix(__filename));


const jsonPrint = function (o) {
	return JSON.stringify(o, 2, ' ');
};

const required = [ 'AGENT_ID', 'AGENT_NAME', 'AGENT_PASSWORD', 'ACCOUNT_URL' ];
for (const index in required) {
	if (!process.env[required[index]]) {
		throw new Error(`Missing environment parameter ${required[index]}`);
	}
}

// Pull required configuration parameters from environment variables
const ev = {
	ACCOUNT_URL: process.env.ACCOUNT_URL,
	AGENT_ID: process.env.AGENT_ID,
	AGENT_NAME: process.env.AGENT_NAME,
	AGENT_PASSWORD: process.env.AGENT_PASSWORD,
	FRIENDLY_NAME: process.env.FRIENDLY_NAME ? process.env.FRIENDLY_NAME : 'Test Holder',
	AGENT_LOG_LEVEL: process.env.AGENT_LOG_LEVEL ? process.env.AGENT_LOG_LEVEL : 'info',
	AGENT_ADMIN_NAME: process.env.AGENT_ADMIN_NAME,
	AGENT_ADMIN_PASSWORD: process.env.AGENT_ADMIN_PASSWORD,
	LOOP_INTERVAL: process.env.LOOP_INTERVAL ? process.env.LOOP_INTERVAL : 5000,
	DELETE_BAD_CONNECTION_OFFERS: process.env.DELETE_BAD_CONNECTION_OFFERS === 'true',
	DELETE_BAD_CREDENTIAL_OFFERS: process.env.DELETE_BAD_CREDENTIAL_OFFERS === 'true',
	CONNECTIONS_CLEANUP: process.env.CONNECTIONS_CLEANUP === 'true',
	CREDENTIALS_CLEANUP: process.env.CREDENTIALS_CLEANUP === 'true',
	VERIFICATIONS_CLEANUP: process.env.VERIFICATIONS_CLEANUP === 'true'
};

for (const key in ev) {
	if (key.toLowerCase().indexOf('password') >= 0) continue;
	logger.debug(`${key}: ${ev[key]}`);
}

// Create Agent for dmv
const agent = new Agent(ev.ACCOUNT_URL, ev.AGENT_ID, ev.AGENT_NAME, ev.AGENT_PASSWORD);
agent.setLoggingLevel(ev.AGENT_LOG_LEVEL);

(async () => {
	let userInfo;

	// Get user info & create if not already set
	try {
		logger.info(`Checking the status of agent info for: ${ev.AGENT_NAME}`);
		userInfo = await agent.getIdentity();
	} catch (error) {
		logger.error(`Failed to get ${ev.AGENT_NAME} info: ${error}`);

		if (ev.AGENT_ADMIN_NAME && ev.AGENT_ADMIN_PASSWORD) {
			logger.info(`Creating agent ${ev.AGENT_NAME} if it does not exist.  May take a while.`);
			userInfo = await agent.createIdentity(ev.AGENT_ADMIN_NAME, ev.AGENT_ADMIN_PASSWORD);
		} else {
			process.exit(1);
		}
	}
	logger.debug(`userInfo = ${jsonPrint(userInfo)}`); //+JSON.stringify(userInfo));

	if (ev.CONNECTIONS_CLEANUP) {
		logger.info('***************DELETING CONNECTIONS***************');
		const connections = await agent.getConnections();
		logger.info(`***************${connections.length} CONNECTIONS TO DELETE***************`);
		for (const index in connections) {
			const conn = connections[index];
			logger.debug(`***************DELETING CONNECTION ${conn.id} to ${conn.remote ? conn.remote.name : 'nobody'}***************`);
			try {
				await agent.deleteConnection(conn.id);
			} catch (error) {
				logger.error(`Error when deleting connection ${conn.id}: ${error}`);
			}
		}
	}

	if (ev.CREDENTIALS_CLEANUP) {
		logger.info('***************DELETING CREDENTIALS***************');
		const credentials = await agent.getCredentials();
		logger.info(`***************${credentials.length} CREDENTIALS TO DELETE***************`);
		for (const index in credentials) {
			logger.debug(`***************DELETING CREDENTIAL ${credentials[index].id}***************`);
			try {
				await agent.deleteCredential(credentials[index].id);
			} catch (error) {
				logger.error(`Error when deleting connection ${credentials[index].id}: ${error}`);
			}
		}
	}

	if (ev.VERIFICATIONS_CLEANUP) {
		logger.info('***************DELETING VERIFICATION***************');
		const verifications = await agent.getVerifications();
		logger.info(`***************${verifications.length} VERIFICATIONS TO DELETE***************`);
		for (const index in verifications) {
			logger.debug(`***************DELETING VERIFICATION ${verifications[index].id}***************`);
			try {
				await agent.deleteVerification(verifications[index].id);
			} catch (error) {
				logger.error(`Error when deleting verification ${verifications[index].id}: ${error}`);
			}
		}
	}

	async function loop () {
		console.log('######################################### loop()...');
		console.log(`My Agency ID is: ${ev.AGENT_NAME}`);

		const offers = await agent.getConnections({
			state: 'inbound_offer'
		});
		logger.info('Connection Offers: '+offers.length);
		if (offers.length > 0) {
			logger.debug('offers='+jsonPrint(offers));
			const offer = offers[0];
			try {
				logger.info(`Accepting connection offer ${offer.id} from  ${offer.remote.name}`);
				const r = await agent.acceptConnection(offer.id);
				logger.info('Accepted connection offer '+r.id+' from '+r.remote.name);
			} catch (error) {
				logger.error(`Couldn't accept connection offer ${offer.id}.  You may want to delete it. Error: ${error}`);
				if (ev.DELETE_BAD_CONNECTION_OFFERS) {
					logger.info(`Deleting bad connection offer ${offer.id}`);
					await agent.deleteConnection(offer.id);
				}
			}
		}

		const credentials = await agent.getCredentials({
			state: 'inbound_offer'
		});
		logger.info('Credential Offers: '+credentials.length);
		if (credentials.length > 0) {
			//logger.info("credentials="+jsonPrint(credentials));
			const credential = credentials[0];
			try {
				logger.info(`Accepting credential offer ${credential.id}...`);
				const r = await agent.updateCredential(credential.id, 'accepted');
				logger.info(`Accepted credential offer ${credential.id}`);
				logger.debug('Accepted credential offer '+jsonPrint(r));
			} catch (error) {
				logger.error(`Couldn't accept credential offer ${credential.id}. You may want to delete it. Error: ${error}`);
				if (ev.DELETE_BAD_CREDENTIAL_OFFERS) {
					logger.info(`Deleting bad credential offer ${credential.id}`);
					await agent.deleteCredential(credential.id);
				}
			}
		}

		// Check for new verification requests
		const verificationRequests = await agent.getVerifications({
			state: {$nin: [ 'passed', 'proof_shared' ]}
		});
		//logger.info("Requests="+jsonPrint(verificationRequests));
		logger.info(`Verification Requests: ${verificationRequests.length}`);
		for (const c in verificationRequests) {
			const request = verificationRequests[c];

			logger.debug(`Verification request: ${jsonPrint(request)}`);
			logger.info(`Verification request status: ${request.state}`);
			if (request.state === 'inbound_proof_request') {
				try {
					//logger.info(" --- proof icon="+request.properties.icon);
					await agent.updateVerification(request.id, 'proof_generated');
					logger.info('Accepted proof request');
				}
				catch (e) {
					logger.error('Error accepting proof request: '+e.message);

					logger.info('***************DELETING PROOF REQUEST proof request***************');
					await agent.deleteVerification(request.id);
					logger.info('Deleted');
					//process.exit(1);
				}
			}
			else if (request.state === 'proof_generated') {
				logger.info('Displaying proof values to be returned:');
				const attributes = request['proof_view']['attributes'];
				for (const i in attributes) {
					let verifiedAttribute = ' ';
					if (attributes[i]['cred_def_id']) {
						verifiedAttribute = '*';
					}
					logger.info('  ' + verifiedAttribute + attributes[i].name + '=' +attributes[i].value);
				}
				logger.info('(*Value from credential)');
				try {
					const r = await agent.updateVerification(request.id, 'proof_shared');
					//logger.info("Send proof response "+jsonPrint(r));
					if (r.state === 'passed') {
						logger.info('Proof response successfully sent');
					}
					else {
						logger.error('Error sending proof response');
						process.exit(1);
					}
				}
				catch (e) {
					logger.error('Error sending proof response: '+e.message);
					process.exit(1);
				}
			}
		}

		setTimeout(loop, ev.LOOP_INTERVAL);
	}
	loop();

})();


