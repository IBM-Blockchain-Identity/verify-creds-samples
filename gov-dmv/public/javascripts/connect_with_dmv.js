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

	$('#refreshInfoButton').click(() => {
		populate_user_info();
	});

	/**
	 * Click handler for the 'Getting My Credential'. Creates a connection invitation, displays the invitation to the user,
	 * and waits for the connection to be accepted or rejected.
	 */
	$('#connectWalletButton').click(async () => {
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
		$('#issuanceModal').modal('show');

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
		'eye_color': {
			element: '#infoEyeColor'
		},
		'vehicle_class': {
			element: '#infoVehicleClass'
		},
		'last_name': {
			element: '#infoLastName'
		},
		'document_discriminator': {
			element: '#infoDocDiscrim'
		},
		'customer_identifier': {
			element: '#infoCustomerID'
		},
		'height': {
			element: '#infoHeight'
		},
		'cardholder_sex': {
			element: '#infoSex'
		},
		'dob': {
			type: 'date',
			element: '#infoDoB'
		},
		'dob_timestamp': {
			element: '#infoDoBTimestamp'
		},
		'signature': {
			element: '#infoSignature'
		},
		'endorsements': {
			element: '#infoEndorsements'
		},
		'hair_color': {
			element: '#infoHairColor'
		},
		'expiration_date': {
			type: 'date',
			element: '#infoExpires'
		},
		'rci_codes': {
			element: '#infoRCI'
		},
		'first_name': {
			element: '#infoFirstName'
		},
		'portrait': {
			friendly_name: 'Portrait',
			element: '#userPortraitPreview'
		},
		'weight': {
			element: '#infoWeight'
		},
		'date_of_issue': {
			type: 'date',
			element: '#infoDateIssued'
		},
		'address_line_1': {
			element: '#infoAddress1'
		},
		'address_line_2': {
			element: '#infoAddress2'
		},
		'city': {
			element: '#infoCity'
		},
		'state': {
			element: '#infoState'
		},
		'zip_code': {
			element: '#infoZipCode'
		},
		'country': {
			element: '#infoCountry'
		},
		'email': {
			element: '#userEmail'
		},
		'agent_name': {
			element: '#userIdentity'
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

		console.log(`Got personal info for ${user_id} ${JSON.stringify(user_doc.personal_info, 0, 1)}`);
		for (const schema_key in dictionary) {
			const config = dictionary[schema_key];
			if (user_doc.personal_info && user_doc.personal_info[schema_key]) {

				if (!config.element) continue;
				$(config.element).val(user_doc.personal_info[schema_key]);

			} else if (user_doc.opts && user_doc.opts[schema_key]) {

				if (!config.element) continue;
				$(config.element).val(user_doc.opts[schema_key]);

			} else {
				continue;
			}
		}

		// Render the profile picture
		$(dictionary.portrait.element)[0].src = user_doc.personal_info.portrait;

		// Show first and last name at top of page
		$('.first-name').html(user_doc.personal_info['first_name']);
		$('.last-name').html(user_doc.personal_info['last_name']);

		// Render QR code to get credential
		const data = {};
		data['to'] = user_doc.personal_info['agent_name'];
		data['type'] = 'credential';
		data['data'] = {};
		data.data['id'] = user_id;
		data.data['name'] = ev_FRIENDLY_NAME;// eslint-disable-line
		data.data['url'] = ev_MY_URL + '/api/issue_credential/' + user_id;// eslint-disable-line
		console.log('QR Code data = '+JSON.stringify(data, 0, 1));
		new QRCode(document.getElementById('qrcodePlaceHolder'), JSON.stringify(data));// eslint-disable-line

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