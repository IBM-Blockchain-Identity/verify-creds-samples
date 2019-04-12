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

$(document).ready(() => {

	// Open the secret credential issuance modal if the right link is clicked on
	$('.issuanceLink').on('click', () => {
		$('#issuanceModal').modal('show');
	});

	// Highlight the account navbar item
	$('#accountsNav').addClass('active');
	document.body.style['background-color'] = '#ffffff';


	// Switch to the settings panel if the profile icon is clicked
	$('#profileNav').on('click', () => {
		$('#accountsNav').removeClass('active');
		$('#profileNav').addClass('active');
		$('#accountPage').addClass('d-none');
		$('#settingsPage').removeClass('d-none');
		document.body.style['background-color'] = '#eeeeee';
	});

	// Switch to the settings panel if the profile icon is clicked
	$('#accountsNav').on('click', () => {
		$('#accountsNav').addClass('active');
		$('#profileNav').removeClass('active');
		$('#accountPage').removeClass('d-none');
		$('#settingsPage').addClass('d-none');
		document.body.style['background-color'] = '#ffffff';
	});

	/**
     * Click handler for the 'Getting My Credential'. Creates a connection invitation, displays the invitation to the user,
     * and waits for the connection to be accepted or rejected.
     */
	$('#connectWalletButton').click(async () => {
		const carousel = $('#issuanceCarousel');
		const ISSUANCE_STEPS = {
			CREATED: 1,
			BUILDING_CREDENTIAL: 1,
			ESTABLISHING_CONNECTION: 2,
			ISSUING_CREDENTIAL: 3,
			FINISHED: 4,
			STOPPED: 6,
			ERROR: 5
		};

		carousel.carousel(ISSUANCE_STEPS.BUILDING_CREDENTIAL);
		try {
			const issuance_info = await $.ajax({
				url: '/api/credentials',
				method: 'POST'
			});

			console.log(`Issuance process created: ${JSON.stringify(issuance_info)}`);

			await new Promise((resolve, reject) => {
				let tries_left = 300;
				const interval = 3000; // milliseconds
				let querying = false;

				const timer = setInterval(() => {

					console.log(`Tries left: ${tries_left--}`);
					if (tries_left <= 0) {
						console.error('Ran out of tries to finish issuing credentials');
						clearInterval(timer);
						return reject(new Error('Issuance took too long'));
					}

					if (querying)
						return console.log('Still running the previous update.  Skipping');

					querying = true;
					console.log('Updating issuance');
					$.ajax({
						url: '/api/credentials',
						method: 'GET'
					}).done((response) => {
						querying = false;

						if (!response || !response.status) {
							const error = new Error(`No status information returned in update response: ${JSON.stringify(response)}`);
							console.error(error);
							clearInterval(timer);
							return reject(error);
						}

						console.log(`Updated issuance status: ${JSON.stringify(response.status)}`);
						if (ISSUANCE_STEPS[response.status])
							carousel.carousel(ISSUANCE_STEPS[response.status]);
						else
							console.warn(`Unknown issuance status detected: ${response.status}`);

						if ([ 'STOPPED', 'ERROR', 'FINISHED' ].indexOf(response.status) >= 0) {
							clearInterval(timer);
							resolve(response.status);
						}

						if (response.status === 'ERROR') {
							console.error(`Credential issuance failed: ${JSON.stringify(response.error)}`);
						}


					}).fail((jqXHR, textStatus, errorThrown) => {
						querying = false;
						console.error('Failed to update status:', errorThrown, jqXHR.responseText);
						const alertText = `Failed to update status. status: ${textStatus}, error: ${errorThrown}, jqXHR:${JSON.stringify(jqXHR)}`;
						clearInterval(timer);
						reject(new Error(alertText));
					});
				}, interval);
			});

		} catch (error) {
			carousel.carousel(ISSUANCE_STEPS.ERROR);
			const message = `Credential issuance failed: ${error.message ? error.message : JSON.stringify(error)}`;
			console.error(message);
			$('#connectionFlowAlert').html(window.alertHTML(message));
		}
	});

	populate_user_info();
});

function populate_user_info () {
	const dictionary = {
		'first_name': {
			element: '#infoFirstName'
		}
	};

	const user_id = window.user_id;
	console.log(`Getting personal info for ${user_id}`);
	$.ajax({
		url: `/api/users/${user_id}`,
		method: 'GET'
	}).done((user_doc) => {
		user_doc = user_doc[user_id];

		console.log(`Got personal info for ${user_id} ${JSON.stringify(user_doc.personal_info)}`);
		for (const schema_key in dictionary) {
			const config = dictionary[schema_key];
			if (!user_doc.personal_info || !user_doc.personal_info[schema_key]) continue;

			if (!config.element) continue;

			$(config.element).html(user_doc.personal_info[schema_key]);
		}

	}).fail((jqXHR, textStatus, errorThrown) => {
		console.error('Failed to get personal info:', errorThrown, jqXHR.responseText);
	});
}