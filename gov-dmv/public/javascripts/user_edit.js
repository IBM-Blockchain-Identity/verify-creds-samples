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

	$('#cancelEditUserButton').click(() => {
		console.log('Cancel editing');
		window.location.href = '/admin/';
	});

	$('#editUserForm').submit((event) => {
		event.preventDefault();
		console.log('Event='+$('#editUserForm').serialize());
		const userEmail = window.user_id;

		// Start the loading animation
		const loader = $('#editUserButton');
		loader.html(loader.data('loading-text'));
		loader.attr('disabled', 'disabled');

		const formArray = $('#editUserForm').serializeArray();
		const formObject = {};
		for (let i = 0; i < formArray.length; i++) {
			formObject[formArray[i]['name']] = formArray[i]['value'];
		}

		// Set dob_timestamp (in days)
		if (formObject.dob) {
			const userDoB = formObject.dob;
			let userDoBTimestamp = 1000000;
			const msInDay = 1000*60*60*24;
			userDoBTimestamp = (1000000 - parseInt((new Date(userDoB)).getTime()/msInDay));
			formObject.dob_timestamp = ''+userDoBTimestamp;
		}

		const opts = {
			agent_name: formObject.agent_name
		};
		delete formObject.agent_name;

		const data = JSON.stringify({
			personal_info: formObject,
			opts: opts
		});

		console.log(`Updating user ${userEmail} with request data ${data}`);
		$.ajax({
			url: `/api/users/${userEmail}`,
			method: 'PUT',
			dataType: 'json',
			contentType: 'application/json',
			data: data
		}).done((user) => {

			// Stop the loader
			loader.html(loader.data('original-text'));
			loader.removeAttr('disabled');

			console.log(`Updated user ${userEmail}: ${JSON.stringify(user)}`);
			window.location.href = '/admin/';

		}).fail((jqXHR, textStatus, errorThrown) => {

			// Stop the loader
			loader.html(loader.data('original-text'));
			loader.removeAttr('disabled');

			console.error(`Failed to create user ${userEmail}`, errorThrown, jqXHR.responseText);
			let alertText = `Failed to create user ${userEmail}. status: ${textStatus}, error: ${errorThrown}, jqXHR:${JSON.stringify(jqXHR)}`;
			if (jqXHR.responseJSON && jqXHR.responseJSON.reason) {
				const response = jqXHR.responseJSON;
				alertText = `Failed to create user ${userEmail}. <strong>error</strong>: ${response.error}, <strong>reason</strong>: ${response.reason}`;
			}
			$('#editUserAlert').html(window.alertHTML(alertText));
		});
	});

	// Display a preview when a user selects a profile pic
	$('#editUserPortrait').on('change', () => {
		const file = $('#editUserPortrait')[0].files[0];
		const portrait_preview = $('#userPortraitPreview');
		const reader = new FileReader();

		console.log(`Reading in file: ${file}`);

		reader.addEventListener('load', () => {
			console.log('Displaying preview');
			const initial_image = document.createElement('img');
			initial_image.src = reader.result;

			initial_image.onload = () => {
				// Scale down the image while maintaining aspect ratio
				const maxHeight = 200;
				const maxWidth = 200;
				let height = initial_image.height;
				let width = initial_image.width;
				if (width > height) {
					if (width > maxWidth) {
						height = Math.round(height * maxWidth / width);
						width = maxWidth;
					}
				} else {
					if (height > maxHeight) {
						width = Math.round(width * maxHeight / height);
						height = maxHeight;
					}
				}

				// Scale the image down by drawing it to a canvas of a smaller size
				const canvas = document.createElement('canvas');
				canvas.width = width;
				canvas.height = height;
				const context = canvas.getContext('2d');
				context.drawImage(initial_image, 0, 0, width, height);
				const resized_image = canvas.toDataURL('image/jpeg', 0.6);

				// Display the resized image and save the data url to the form
				portrait_preview[0].src = resized_image;
				portrait_preview.removeClass('d-none');
				$('input[name="portrait"]').val(resized_image);
			};
		}, false);

		if (file) {
			reader.readAsDataURL(file);
		}
	});

	populate_user_data();
});

/**
 * Get the user and populate the user form.
 * @returns {void}
 */
function populate_user_data () {
	const userID = window.user_id;
	console.log(`Editing user ${userID}`);

	$.ajax({
		url: `/api/users/${userID}`,
		method: 'GET'
	}).done((user) => {
		console.log(`Retrieved user ${userID}`);
		console.log('User data='+JSON.stringify(user));

		$.each(user[userID].personal_info, (k, v) => {
			console.log('k='+k+' v='+JSON.stringify(v));
			$('[name="'+k+'"]').val(v);
		});

		// Render the profile picture
		const preview = $('#userPortraitPreview');
		if (preview && preview[0])
			preview[0].src = user[userID].personal_info.portrait;

		$.each(user[userID].opts, (k, v) => {
			console.log('k='+k+' v='+JSON.stringify(v));
			$('[name="'+k+'"]').val(v);
		});

	}).fail((jqXHR, textStatus, errorThrown) => {
		console.error('Failed to get user:', errorThrown, jqXHR.responseText);
		let alertText = `Failed to get user. status: ${textStatus}, error: ${errorThrown}, jqXHR:${JSON.stringify(jqXHR)}`;
		if (jqXHR.responseJSON && jqXHR.responseJSON.reason) {
			const response = jqXHR.responseJSON;
			alertText = `Failed to get user. <strong>error</strong>: ${response.error}, <strong>reason</strong>: ${response.reason}`;
		}
		$('#userTableAlert').html(window.alertHTML(alertText));
	});
}

