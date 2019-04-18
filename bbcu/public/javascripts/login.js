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

	const loginCarousel = $('#loginCarousel');
	const loginCarouselSlides = {
		MOBILE_WALLET_SIGN_ON: 0,
		USERPASS_SIGN_ON: 1,
		VC_SIGN_ON: 2
	};

	// Show the user id/password sign-on form if the user clicks on the traditional signin links
	$('.userpassLink').on('click', () => {
		loginCarousel.carousel(loginCarouselSlides.USERPASS_SIGN_ON);
	});

	// Show the mobile wallet sign-on form if the appropriate links are clicked
	$('.vcSignonLink').on('click', () => {
		loginCarousel.carousel(loginCarouselSlides.VC_SIGN_ON);
	});

	// Show the userpass signon input labels when the user id or password form inputs are clicked
	$('#userID').focus(() => {
		$('#userIDLabel').css('visibility', 'visible');
	});
	$('#userID').focusout(() => {
		if (!$('#userID').val().trim())
			$('#userIDLabel').css('visibility', 'hidden');
	});
	$('#password').focus(() => {
		$('#passwordLabel').css('visibility', 'visible');
	});
	$('#password').focusout(() => {
		if (!$('#password').val().trim())
			$('#passwordLabel').css('visibility', 'hidden');
	});

	// Show the vc signon input labels when the user id or phone number form inputs are clicked
	$('#vcUserID').focus(() => {
		$('#vcUserIDLabel').css('visibility', 'visible');
	});
	$('#vcUserID').focusout(() => {
		if (!$('#vcUserID').val().trim())
			$('#vcUserIDLabel').css('visibility', 'hidden');
	});
	$('#vcPhone').focus(() => {
		$('#vcPhoneLabel').css('visibility', 'visible');
	});
	$('#vcPhone').focusout(() => {
		if (!$('#vcPhone').val().trim())
			$('#vcPhoneLabel').css('visibility', 'hidden');
	});

	// Allow users to enter either a user id or phone number for vc sign in, but not both
	$('#vcUserID').on('input', () => {
		$('#vcPhone').val('');
		$('#vcPhoneLabel').css('visibility', 'hidden');
	});
	$('#vcPhone').on('input', () => {
		$('#vcUserID').val('');
		$('#vcUserIDLabel').css('visibility', 'hidden');
	});

	// Login form
	$('#loginForm').submit((event) => {
		console.log('Submit='+$('#loginForm').serialize());
		event.preventDefault();

		const formArray = $('#loginForm').serializeArray();
		const formObject = {};
		for (let i = 0; i < formArray.length; i++) {
			formObject[formArray[i]['name']] = formArray[i]['value'].trim();
		}

		console.log(`Logging in. ${JSON.stringify(formObject)}`);
		$.ajax({
			url: '/login/userpass',
			method: 'POST',
			dataType: 'json',
			contentType: 'application/json',
			data: JSON.stringify(formObject)
		}).done((resp) => {

			console.log(`Login response: ${JSON.stringify(resp)}`);
			window.location.pathname = '/account';

		}).fail((jqXHR, textStatus, errorThrown) => {
			console.error(`Failed to log in ${errorThrown} ${jqXHR.responseText}`);
		});
	});

	const vcSignonForm = $('#vcSignonForm');
	const vcSignonModal = $('#vcSignonModal');
	const vcSignonCarousel = $('#vcSignonCarousel');
	const vcSignonCarouselSlides = {
		LOGGING_IN: 0,
		FAILED: 1
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

		// You can only use the sign on api with a username of phone number
		const data = {
			username: formObject.username,
			connection_method: 'in_band'
		};

		// Reset the signon carousel
		vcSignonCarousel.carousel(vcSignonCarouselSlides.LOGGING_IN);
		// Open the signon modal
		vcSignonModal.modal('show');

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
					CREATED: vcSignonCarouselSlides.LOGGING_IN,
					ESTABLISHING_CONNECTION: vcSignonCarouselSlides.LOGGING_IN,
					CHECKING_CREDENTIAL: vcSignonCarouselSlides.LOGGING_IN,
					FINISHED: vcSignonCarouselSlides.LOGGING_IN,
					STOPPED: vcSignonCarouselSlides.FAILED,
					ERROR: vcSignonCarouselSlides.FAILED
				};


				// Update the carousel to match the current status
				if (REMOTE_LOGIN_STEPS.hasOwnProperty(response.status))
					vcSignonCarousel.carousel(REMOTE_LOGIN_STEPS[response.status]);
				else
					console.warn(`Unknown issuance status detected: ${response.status}`);


				if ('ERROR' === response.status) {
					// TODO display a proper error message
					let message = JSON.stringify(response);
					if (response.vc_login.error) {
						message = `Error: ${response.vc_login.error}, Reason: ${response.vc_login.reason}`;
					}
					console.error(`Failed to complete VC signon: ${message}`);
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
						await window.credentialHandler({connectionOffer: response.connection_offer});
					}

					if (!verification_shown && response.verification) {
						verification_shown = true;
						console.log('Accepting proof request via extension');
						await window.credentialHandler({proofRequest: response.verification.id});
					}
				}

				await new Promise((resolve, reject) => {
					setTimeout(resolve, interval);
				});
			}

		} catch (error) {

			// TODO display a proper error;
			vcSignonCarousel.carousel(vcSignonCarouselSlides.FAILED);
			console.error(`VC login failed: ${error}`);
		}
	});

	const vcSignupModal = $('#vcSignupModal');
	const vcSignupCarousel = $('#vcSignupCarousel');
	const vcSignupCarouselSlides = {
		BEFORE_REGISTERING: 0,
		ENTER_USER_INFO: 1,
		ESTABLISHING_CONNECTION: 2,
		CHECKING_CREDENTIAL: 3,
		ISSUING_CREDENTIAL: 4,
		NOT_ALLOWED: 5,
		ALREADY_HAVE_WALLET: 6,
		GETTING_THE_APP: 7
	};

	// Open the signup modal if the user wants to signup for a mobile wallet account
	$('.vcSignupLink').on('click', () => {
		vcSignupCarousel.carousel(vcSignupCarouselSlides.BEFORE_REGISTERING);
		vcSignupModal.modal('show');
	});

	// Handle all the cancel buttons/links in the signup flow
	$('.vcSignupCancel').on('click', () => {
		vcSignupModal.modal('hide');
	});

	// There's a slide for getting more information on the mobile wallet app and links to reach it in the signup flow
	$('.info-link').on('click', () => {
		vcSignupCarousel.carousel(vcSignupCarouselSlides.GETTING_THE_APP);
	});

	// Takes us from the "Creds you need" screen to the user signup form
	$('#credsNextButton').on('click', () => {
		$('#signupNextButton').removeAttr('disabled');
		vcSignupCarousel.carousel(vcSignupCarouselSlides.ENTER_USER_INFO);
	});

	// Show the signup form input labels when the user is filling out the fields
	const signup_user = $('#signupUserID');
	const signup_user_label = $('label[for="signupUserID"]');
	const signup_password = $('#signupPassword');
	const signup_password_label = $('label[for="signupPassword"]');
	const signup_phone = $('#signupPhone');
	const signup_phone_label = $('label[for="signupPhone"]');
	const signup_agent_name = $('#signupAgentName');
	const signup_agent_name_label = $('label[for="signupAgentName"]');

	signup_user.focus(() => {
		signup_user_label.css('visibility', 'visible');
	});
	signup_user.focusout(() => {
		if (!signup_user.val().trim())
			signup_user_label.css('visibility', 'hidden');
	});
	signup_password.focus(() => {
		signup_password_label.css('visibility', 'visible');
	});
	signup_password.focusout(() => {
		if (!signup_password.val().trim())
			signup_password_label.css('visibility', 'hidden');
	});
	signup_phone.focus(() => {
		signup_phone_label.css('visibility', 'visible');
	});
	signup_phone.focusout(() => {
		if (!signup_phone.val().trim())
			signup_phone_label.css('visibility', 'hidden');
	});
	signup_agent_name.focus(() => {
		signup_agent_name_label.css('visibility', 'visible');
	});
	signup_agent_name.focusout(() => {
		if (!signup_agent_name.val().trim())
			signup_agent_name_label.css('visibility', 'hidden');
	});

	$('#signupNextButton').on('click', async () => {

		console.log('Submit='+$('#signupForm').serialize());

		const formArray = $('#signupForm').serializeArray();
		const formObject = {};
		for (let i = 0; i < formArray.length; i++) {
			formObject[formArray[i]['name']] = formArray[i]['value'].trim();
		}
		console.log(`Signup info: ${JSON.stringify(formObject)}`);
		const username = formObject.username;
		const password = formObject.password;
		const agent_name = formObject.agent_name;

		const REMOTE_SIGNUP_STEPS = {
			CREATED: 'CREATED',
			ESTABLISHING_CONNECTION: 'ESTABLISHING_CONNECTION',
			CHECKING_CREDENTIAL: 'CHECKING_CREDENTIAL',
			ISSUING_CREDENTIAL: 'ISSUING_CREDENTIAL',
			FINISHED: 'FINISHED',
			STOPPED: 'STOPPED',
			ERROR: 'ERROR'
		};
		$('#signupNextButton').attr('disabled', 'disabled');
		console.log(`Creating signup for user ${username}`);
		try {
			const response = await $.ajax({
				url: '/signup',
				method: 'POST',
				dataType: 'json',
				contentType: 'application/json',
				data: JSON.stringify({
					password: password,
					username: username,
					agent_name: agent_name,
					connection_method: 'in_band'
				})
			});
			console.log(`Signup response: ${JSON.stringify(response)}`);

			let tries_left = 300;
			const interval = 4000; // milliseconds
			let connection_shown = false;
			let verification_shown = false;
			let credential_shown = false;
			const running = true;
			while (running) {

				console.log(`Tries left: ${tries_left--}`);
				if (tries_left <= 0) {
					throw new Error('Account signup took too long');
				}

				let response = await $.ajax({
					url: '/signup/status',
					method: 'GET',
					dataType: 'json',
					contentType: 'application/json'
				});

				if (!response || !response.signup || !response.signup.status)
					throw new Error(`No status information returned in update response: ${JSON.stringify(response)}`);
				console.log(`Signup status response: ${JSON.stringify(response)}`);
				const signup_status = response.signup.status;
				response = response.signup;

				if (signup_status === REMOTE_SIGNUP_STEPS.ESTABLISHING_CONNECTION || signup_status === REMOTE_SIGNUP_STEPS.CREATED) {
					vcSignupCarousel.carousel(vcSignupCarouselSlides.ESTABLISHING_CONNECTION);

				} else if (signup_status === REMOTE_SIGNUP_STEPS.CHECKING_CREDENTIAL) {
					vcSignupCarousel.carousel(vcSignupCarouselSlides.CHECKING_CREDENTIAL);

				} else if (signup_status === REMOTE_SIGNUP_STEPS.ISSUING_CREDENTIAL) {
					vcSignupCarousel.carousel(vcSignupCarouselSlides.ISSUING_CREDENTIAL);

				} else if (signup_status === REMOTE_SIGNUP_STEPS.FINISHED) {

					// Redirect to account page.  The user's session should be logged in at this point.
					await new Promise((resolve, reject) => {
						setTimeout(resolve, 3000);
					});
					window.location.href = '/account';

				} else if (signup_status === REMOTE_SIGNUP_STEPS.STOPPED) {
					vcSignupCarousel.carousel(vcSignupCarouselSlides.NOT_ALLOWED);
					break;
				} else if (signup_status === REMOTE_SIGNUP_STEPS.ERROR) {
					if (response.error && response.error === 'SIGNUP_USER_ALREADY_EXISTS') {
						vcSignupCarousel.carousel(vcSignupCarouselSlides.ALREADY_HAVE_WALLET);
					} else {
						vcSignupCarousel.carousel(vcSignupCarouselSlides.NOT_ALLOWED);
					}
					break;
				}

				if (use_extension) {
					// TODO render the connection offer as a QR code
					if (!connection_shown && response.connection_offer) {
						connection_shown = true;
						console.log('Accepting connection offer via extension');
						await window.credentialHandler({connectionOffer: response.connection_offer});
					}

					if (!verification_shown && response.verification) {
						verification_shown = true;
						console.log('Accepting proof request via extension');
						await window.credentialHandler({proofRequest: response.verification.id});
					}

					if (!credential_shown && response.credential && response.credential.id) {
						credential_shown = true;
						console.log('Accepting credential offer via extension');
						await window.credentialHandler({credentialOffer: response.credential.id});
					}
				}

				await new Promise((resolve, reject) => {
					setTimeout(resolve, interval);
				});
			}

		} catch (error) {

			console.error('Failed to create signup', error);
			vcSignupCarousel.carousel(vcSignupCarouselSlides.NOT_ALLOWED);
		}
	});

	docReady.resolve();
});

const docReady = $.Deferred();
const extensionReady = $.Deferred();
let use_extension = false;

$(document).on('contentHolder_injected', async () => {
	console.log(`Extension loaded.  window.credentialHandler: ${typeof window.credentialHandler}`);

	// Get the public DID from the browser's agent
	const state = await window.credentialHandler({stateRequest: {}});
	console.log('state request response: ' + state);


	const initialized = await window.credentialHandler({init: {}});
	console.log(`Initialized: ${initialized}`);
	if (initialized === 'True') {
		console.log(`My DID: ${await window.credentialHandler({info: 'info'})}`);
		extensionReady.resolve();
	}
});

$.when(docReady, extensionReady).done(async () => {
	$('.extension-loaded').removeClass('d-none');
	use_extension = true;
});
