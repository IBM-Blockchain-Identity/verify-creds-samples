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

$(document).ready(() => {

	window.user_id = decodeURIComponent(window.readCookie('user_id'));

	const connectButton = $('.issueButton');

	/**
	 * Click handler for credential button. Creates a connection invitation, displays the invitation to the user,
	 * and waits for the connection to be accepted or rejected.
	 */
	connectButton.click(async () => {
		connectButton.attr('disabled', true);

		try {
			await issue_credential();
		} catch (error) {
			console.error(`Credential issuance failed: ${error}`);
		}

		connectButton.attr('disabled', false);
	});

	// Deletes the user's account
	const deleteButton = $('.delete-account');
	deleteButton.click(async () => {

		// Start the loading animation
		const loader = deleteButton;
		loader.html(loader.data('loading-text'));
		loader.attr('disabled', 'disabled');

		if (confirm('Are you sure you want to delete your account?')) {

			try {
				console.log(`Deleting account ${window.user_id}`);
				const delete_response = await $.ajax({
					url: `/api/users/${window.user_id}`,
					method: 'DELETE',
					contentType: 'application/json'
				});
				console.log(`Deleted ${window.user_id}: ${JSON.stringify(delete_response)}`);
				console.log('Redirecting to /logout');
				await new Promise((resolve, reject) => {
					setTimeout(resolve, 2000);
				});
				window.location.href = '/logout';

			} catch (error) {

				loader.removeAttr('disabled');
				loader.html(loader.data('original-text'));

				console.error(`Failed to delete account: ${JSON.stringify(error)}`);
				alert(`Failed to delete account: ${JSON.stringify(error, 0, 1)}`);
			}
		} else {

			loader.removeAttr('disabled');
			loader.html(loader.data('original-text'));

			console.log(`User changed their mind.  We won't delete ${window.user_id}`);
		}
	});

	populate_user_info();
	docReady.resolve();
});

const docReady = $.Deferred();
const extensionReady = $.Deferred();
let use_extension = false;

$(document).on('contentHolder_injected', async () => {
	console.log(`Extension loaded.  window.verifyCreds: ${typeof window.verifyCreds}`);

	try {
		const initialized = await window.verifyCreds({operation: 'init'});
		console.log(`Extension initialized: ${initialized}`);
		if (initialized === 'True') {
			console.log(`Holder's agent info: ${await window.verifyCreds({operation: 'info'})}`);
			extensionReady.resolve();
		}
	} catch (error) {
		console.error(`Extension failed: ${JSON.stringify(error)}`);
	}
});

$.when(docReady, extensionReady).done(async () => {
	$('#extensionLoaded').removeClass('d-none');
	use_extension = true;
});

async function issue_credential () {
	const carousel = $('#issuanceCarousel');
	const ISSUANCE_STEPS = {
		CREATED: 0,
		BUILDING_CREDENTIAL: 0,
		ESTABLISHING_CONNECTION: 1,
		ISSUING_CREDENTIAL: 2,
		FINISHED: 3,
		STOPPED: 5,
		ERROR: 4
	};

	carousel.carousel(ISSUANCE_STEPS.BUILDING_CREDENTIAL);
	$('#issuanceModal').modal({
		backdrop: 'static',
		keyboard: false
	});

	try {
		const issuance_info = await $.ajax({
			url: '/api/credentials',
			method: 'POST',
			contentType: 'application/json',
			dataType: 'json',
			data: JSON.stringify({})
		});

		console.log(`Issuance process created: ${JSON.stringify(issuance_info)}`);

		let tries_left = 300;
		const interval = 3000; // milliseconds
		let connection_shown = false;
		let credential_shown = false;
		const running = true;
		while (running) {

			console.log(`Tries left: ${tries_left--}`);
			if (tries_left <= 0) {
				throw new Error('Credential issuance took too long');
			}

			console.log('Getting updated issuance status');
			const response = await $.ajax({
				url: '/api/credentials',
				method: 'GET'
			});

			if (!response || !response.status)
				throw new Error(`No status information returned in update response: ${JSON.stringify(response)}`);

			console.log(`Updated issuance status: ${JSON.stringify(response)}`);

			// Update the carousel to match the current status
			if (ISSUANCE_STEPS.hasOwnProperty(response.status))
				carousel.carousel(ISSUANCE_STEPS[response.status]);
			else
				console.warn(`Unknown issuance status detected: ${response.status}`);

			if ('ERROR' === response.status) {
				if (response.error)
					$('#errorCode').html(`Code: ${response.error}`);
				if (response.reason)
					$('#errorMessage').html(`Reason: ${response.reason}`);
				console.error(`Credential issuance failed: ${JSON.stringify(response.error)}`);
			}

			if ([ 'STOPPED', 'ERROR', 'FINISHED' ].indexOf(response.status) >= 0) {
				break;
			}

			if (use_extension) {
				// TODO render the connection offer as a QR code
				if (!connection_shown && response.connection_offer) {
					connection_shown = true;
					console.log('Accepting connection offer via extension');
					try {
						window.verifyCreds({
							operation: 'respondToConnectionOffer',
							connectionOffer: response.connection_offer
						});
					} catch (error) {
						console.error(`Extension failed to show connection offer: ${JSON.stringify(error)}`);
					}
				}

				if (!credential_shown && response.credential && response.credential.id) {
					credential_shown = true;
					console.log('Accepting credential offer via extension');
					try {
						window.verifyCreds({
							operation: 'respondToCredentialOffer',
							credentialOfferId: response.credential.id
						});
					} catch (error) {
						console.error(`Extension failed to show credential offer: ${JSON.stringify(error)}`);
					}
				}
			}

			await new Promise((resolve, reject) => {
				setInterval(resolve, interval);
			});
		}

	} catch (error) {
		carousel.carousel(ISSUANCE_STEPS.ERROR);
		const message = `Credential issuance failed: ${error.message ? error.message : JSON.stringify(error)}`;
		console.error(message);
		$('#errorMessage').html(message);
	}
}

function populate_user_info () {
	const dictionary = {
		'Hire Date': {
			type: 'date',
			element: '.infoHireDate'
		},
		'Base Salary': {
			element: '.infoBaseSalary'
		},
		'Job Title': {
			element: '.infoJobTitle'
		},
		'portrait': {
			friendly_name: 'Portrait',
			element: '.profile-pic'
		}
	};

	// Start the loading animation
	const loader = $('#refreshInfoButton');
	loader.html(loader.data('loading-text'));
	loader.attr('disabled', 'disabled');

	const user_id = window.user_id;
	console.log(`Getting personal info for ${user_id}`);
	$.ajax({
		url: `/api/users/${user_id}`,
		method: 'GET'
	}).done((user_doc) => {
		user_doc = user_doc[user_id];

		// Stop the loader
		loader.html(loader.data('original-text'));
		loader.removeAttr('disabled');

		if (user_doc && user_doc.opts)
			console.log(`User's agent information: ${JSON.stringify(user_doc.opts, 0, 1)}`);

		console.log(`Got personal info for ${user_id} ${JSON.stringify(user_doc.personal_info)}`);
		for (const schema_key in dictionary) {
			const config = dictionary[schema_key];
			if (!user_doc.personal_info || !user_doc.personal_info[schema_key]) continue;

			if (!config.element) continue;

			$(config.element).html(user_doc.personal_info[schema_key]);
		}

		// Render the profile picture
		$(dictionary.portrait.element)[0].src = user_doc.personal_info.portrait;

		$('.infoEmail').html(window.emailParser(user_doc.email));
		$('.infoFullName').html(`${user_doc.personal_info['First Name']} ${user_doc.personal_info['Last Name']}`);

	}).fail((jqXHR, textStatus, errorThrown) => {
		// Stop the loader
		loader.html(loader.data('original-text'));
		loader.removeAttr('disabled');

		console.error('Failed to get personal info:', errorThrown, jqXHR.responseText);
		let alertText = `Failed to get personal info. status: ${textStatus}, error: ${errorThrown}, jqXHR:${JSON.stringify(jqXHR)}`;
		if (jqXHR.responseJSON && jqXHR.responseJSON.reason) {
			const response = jqXHR.responseJSON;
			alertText = `Failed to get personal info. <strong>error</strong>: ${response.error}, <strong>reason</strong>: ${response.reason}`;
		}
		$('#personalInfoAlert').html(window.alertHTML(alertText));
	});
}