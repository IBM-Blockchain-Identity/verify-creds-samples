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

$(document).ready(async () => {

	// Page navigation
	const loginCarousel = $('#loginCarousel');
	const loginCarouselSlides = {
		CREATE_ACCOUNT: 0,
		VC_LOGIN: 1,
		USERPASS_LOGIN: 2
	};

	$('.open-vc-login').click(async () => {
		loginCarousel.carousel(loginCarouselSlides.VC_LOGIN);
	});

	$('.open-signup').click(async () => {
		loginCarousel.carousel(loginCarouselSlides.CREATE_ACCOUNT);
	});

	$('.open-userpass-login').click(async () => {
		loginCarousel.carousel(loginCarouselSlides.USERPASS_LOGIN);
	});

	// Display a preview when a user selects a profile pic
	const portrait_input = $('#signupPortrait');
	const portrait_preview = $('#userPortraitPreview');
	const portrait_required = $('#profilePicRequired');

	portrait_input.on('change', () => {
		const file = portrait_input[0].files[0];
		const reader = new FileReader();

		console.log(`Reading in file: ${JSON.stringify(file)}`);

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
				portrait_required.addClass('d-none');
			};
		}, false);

		if (file) {
			reader.readAsDataURL(file);
		}
	});

	// Username and password based login
	const userpass_form = $('#passwordLoginForm');
	userpass_form.submit(async (event) => {
		event.preventDefault();

		const formArray = userpass_form.serializeArray();
		const formObject = {};
		for (let i = 0; i < formArray.length; i++) {
			formObject[formArray[i]['name'].trim()] = formArray[i]['value'].trim();
		}

		// Start the loading animation
		const loader = $('#signupCreateButton');
		loader.html(loader.data('loading-text'));
		loader.attr('disabled', 'disabled');

		console.log(`Logging in as ${formObject.email}`);
		try {
			await $.ajax({
				url: '/login/userpass',
				method: 'POST',
				dataType: 'json',
				contentType: 'application/json',
				data: JSON.stringify({
					username: formObject.email,
					password: formObject.password
				})
			});
			console.log(`Logged in as ${formObject.email}, redirecting...`);
			window.location.href = '/account';
		} catch (error) {
			// Stop the loader
			loader.html(loader.data('original-text'));
			loader.removeAttr('disabled');

			console.error(`Failed to log in as ${formObject.email}: ${JSON.stringify(error)}`);
			const alertText = `Failed to log in as ${formObject.email}. error: ${JSON.stringify(error)}`;
			$('#userpassLoginAlert').html(window.alertHTML(alertText));
		}
	});

	// Make sure new users are being given the password we think they are
	const signup_password = $('#signupPassword');
	const signup_confirm_password = $('#signupConfirmPassword');
	const signup_password_message = $('#signupPasswordMessage');

	$('#signupPassword, #signupConfirmPassword').on('keyup', () => {
		if (signup_password.val() === signup_confirm_password.val()) {
			if (signup_password.val())
				signup_password_message.html('Matching').css('color', 'green');
			else
				signup_password_message.html('');
		} else {
			signup_password_message.html('Not Matching').css('color', 'red');
		}
	});

	// Don't let new users sign up without accepting the agreement
	const signupCheckbox = $('#signupAgreementCheckbox');
	const signupButton = $('#signupAcceptButton');
	const signupCancelButton = $('#signupCancelButton');
	const agreementModal = $('#signupAgreementModal');

	signupCheckbox.change(() => {
		if (signupCheckbox.is(':checked')) {
			signupButton.removeAttr('disabled');
		} else {
			signupButton.attr('disabled', 'disabled');
		}
	});

	// Create an account from the signup form
	const signup_form = $('#signupForm');
	signup_form.submit(async (event) => {
		console.log(`Submit=${signup_form.serialize()}`);
		event.preventDefault();

		const formArray = signup_form.serializeArray();
		const formObject = {};
		for (let i = 0; i < formArray.length; i++) {
			formObject[formArray[i]['name'].trim()] = formArray[i]['value'].trim();
		}

		console.log(`portrait: ${formObject.portrait}`);
		if (!formObject.portrait) {
			portrait_required.removeClass('d-none');
			return;
		}

		signupButton.attr('disabled', 'disabled');
		signupCheckbox.prop('checked', false);
		agreementModal.modal('show');
		try {
			console.log('Prompting user to accept signup agreement');
			await new Promise((resolve, reject) => {
				let accepted = false;

				agreementModal.on('hidden.bs.modal', () => {
					if (accepted) resolve();
					else reject(new Error('Signup agreement was not accepted'));
					agreementModal.off('hidden.bs.modal');
					signupButton.off('click');
				});

				signupButton.click(() => {
					console.log('Signup agreement accepted');
					accepted = true;
					agreementModal.modal('hide');
				});

				signupCancelButton.click(() => {
					agreementModal.modal('hide');
				});
			});
		} catch (error) {
			console.error(`Signup agreement failed: ${error}`);
			return;
		}

		formObject.email = `${formObject.email.trim()}@example.com`;
		const userEmail = formObject.email;

		if (formObject.password !== formObject.confirm_password)
			return console.error('Passwords must match!');

		const password = formObject.password;
		delete formObject.password;
		delete formObject.confirm_password;

		const opts = {
			invitation_url: formObject.invitation_url
		};
		delete formObject.invitation_url;

		// Build a complete user record from the form inputs and some hardcoded attributes
		if (!window.default_attributes)
			throw new Error('Default user attributes were not found');
		const user_record = JSON.parse(JSON.stringify(window.default_attributes));
		delete user_record.portrait; // Force new users to provide a portrait
		for (const key in formObject) {
			user_record[key] = formObject[key];
		}
		// Add email to the credential for login convenience
		user_record['email'] = userEmail;

		// Set dob_timestamp (in days)
		if (user_record.dob) {
			const userDoB = user_record.dob;
			const msInDay = 1000*60*60*24;
			const userDoBTimestamp = (1000000 - parseInt((new Date(userDoB)).getTime()/msInDay));
			user_record.dob_timestamp = ''+userDoBTimestamp;
		}

		// Start the loading animation
		const loader = $('#signupCreateButton');
		loader.html(loader.data('loading-text'));
		loader.attr('disabled', 'disabled');

		const data = JSON.stringify({
			personal_info: user_record,
			opts: opts,
			password: password
		});

		console.log(`Creating user ${userEmail} with request data ${JSON.stringify(data, 0, 1)}`);
		let user;
		try {
			user = await $.ajax({
				url: `/api/users/${userEmail}`,
				method: 'POST',
				dataType: 'json',
				contentType: 'application/json',
				data: data
			});
			console.log(`Created user ${userEmail}: ${JSON.stringify(user)}`);

		} catch (error) {

			// Stop the loader
			loader.html(loader.data('original-text'));
			loader.removeAttr('disabled');

			console.error(`Failed to create account ${userEmail}: ${JSON.stringify(error)}`);
			const alertText = `Failed to create account ${userEmail}. error: ${JSON.stringify(error)}`;
			$('#signupAlert').html(window.alertHTML(alertText));
			return;
		}

		console.log(`Signing in as ${userEmail}`);
		await new Promise((resolve, reject) => {
			setTimeout(resolve, 3000);
		});
		try {
			await $.ajax({
				url: '/login/userpass',
				method: 'POST',
				dataType: 'json',
				contentType: 'application/json',
				data: JSON.stringify({
					username: userEmail,
					password: password
				})
			});
			console.log(`Logged in as ${userEmail}, redirecting...`);
			window.location.href = '/account';
		} catch (error) {
			// Stop the loader
			loader.html(loader.data('original-text'));
			loader.removeAttr('disabled');

			console.error(`Failed to log in to created account ${userEmail}: ${JSON.stringify(error)}`);
			const alertText = `Failed to log in to created account ${userEmail}. error: ${JSON.stringify(error)}`;
			$('#signupAlert').html(window.alertHTML(alertText));
		}
	});

	const vcSignonForm = $('#vcLoginForm');
	const vcSignonModal = $('#vcLoginModal');
	const vcSignonCarousel = $('#vcLoginCarousel');
	const vcSignonCarouselSlides = {
		ESTABLISHING_CONNECTION: 0,
		CHECKING_LICENSE: 1,
		LOGGING_IN: 2,
		FAILED: 3
	};

	// Sign on using VCs
	vcSignonForm.submit(async (event) => {
		event.preventDefault();

		const formArray = vcSignonForm.serializeArray();
		const formObject = {};
		for (let i = 0; i < formArray.length; i++) {
			formObject[formArray[i]['name']] = formArray[i]['value'].trim();
		}
		console.log(`VC Sign in info: ${JSON.stringify(formObject)}`);

		// You can only use the sign on api with a username
		const data = {
			username: formObject.email
		};

		// Reset the signon carousel
		vcSignonCarousel.carousel(vcSignonCarouselSlides.ESTABLISHING_CONNECTION);
		// Open the signon modal and keep it open
		vcSignonModal.modal({
			backdrop: 'static',
			keyboard: false
		});

		try {
			const response = await $.ajax({
				url: '/login/vc',
				method: 'POST',
				dataType: 'json',
				contentType: 'application/json',
				data: JSON.stringify(data)
			});

			console.log(`Created VC login: ${JSON.stringify(response)}`);

			let tries_left = 300;
			const interval = 4000; // milliseconds
			let connection_shown = false;
			let verification_shown = false;
			const running = true;
			while (running) {

				console.log(`Tries left: ${tries_left--}`);
				if (tries_left <= 0) {
					throw new Error('VC login took too long');
				}

				let response = await $.ajax({
					url: '/login/vc/status',
					method: 'GET',
					dataType: 'json',
					contentType: 'application/json'
				});

				if (!response || !response.vc_login || !response.vc_login.status)
					throw new Error(`No status information returned in update response: ${JSON.stringify(response)}`);
				response = response.vc_login;
				console.log(`Updated login status: ${JSON.stringify(response.status)}`);

				const REMOTE_LOGIN_STEPS = {
					CREATED: vcSignonCarouselSlides.ESTABLISHING_CONNECTION,
					ESTABLISHING_CONNECTION: vcSignonCarouselSlides.ESTABLISHING_CONNECTION,
					CHECKING_CREDENTIAL: vcSignonCarouselSlides.CHECKING_LICENSE,
					FINISHED: vcSignonCarouselSlides.LOGGING_IN,
					STOPPED: vcSignonCarouselSlides.FAILED,
					ERROR: vcSignonCarouselSlides.FAILED
				};


				// Update the carousel to match the current status
				if (REMOTE_LOGIN_STEPS.hasOwnProperty(response.status))
					vcSignonCarousel.carousel(REMOTE_LOGIN_STEPS[response.status]);
				else
					console.warn(`Unknown login status detected: ${response.status}`);


				if ('ERROR' === response.status) {
					if (response.error)
						$('#loginErrorCode').html(`Code: ${response.error}`);
					if (response.reason)
						$('#loginErrorMessage').html(`Reason: ${response.reason}`);
					console.error(`Failed to complete VC signon: ${JSON.stringify(response)}`);
					break;

				} else if ('FINISHED' === response.status) {
					console.log('VC Signon successful.  Redirecting to account page');

					await new Promise((resolve, reject) => {
						setTimeout(resolve, 3000);
					});

					// Redirect to account page.  The user's session should be logged in at this point.
					window.location.href = '/account';
				}

				if ([ 'STOPPED', 'ERROR' ].indexOf(response.status) >= 0) {
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

					if (!verification_shown && response.verification) {
						verification_shown = true;
						console.log('Accepting proof request via extension');
						try {
							window.verifyCreds({
								operation: 'respondToProofRequest',
								proofRequestId: response.verification.id
							});
						} catch (error) {
							console.error(`Extension failed to show proof request: ${JSON.stringify(error)}`);
						}
					}
				}

				await new Promise((resolve, reject) => {
					setTimeout(resolve, interval);
				});
			}

		} catch (err) {
			let error;
			if (err && err.responseJSON) error = err.responseJSON;
			else error = err;

			if (error.error)
				$('#loginErrorCode').html(`Code: ${error.error}`);
			$('#loginErrorMessage').html(`Reason: ${error.reason}`);

			vcSignonCarousel.carousel(vcSignonCarouselSlides.FAILED);
			console.error(`VC login failed: ${JSON.stringify(error)}`);
		}
	});

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
	$('.extension-loaded').removeClass('d-none');
	use_extension = true;
});