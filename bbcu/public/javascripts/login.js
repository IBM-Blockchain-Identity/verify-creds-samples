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
	vcSignonForm.submit((event) => {
		event.preventDefault();

		const formArray = vcSignonForm.serializeArray();
		const formObject = {};
		for (let i = 0; i < formArray.length; i++) {
			formObject[formArray[i]['name']] = formArray[i]['value'].trim();
		}
		console.log(`VC Sign in info: ${JSON.stringify(formObject)}`);

		// Check the username OR phone number
		if (!formObject.username && !formObject.phone_number) {
			console.log('A phone number or username must be supplied to use vc signon');
			$('#vcSignonValidation').css('visibility', 'visible');
			return;
		}
		$('#vcSignonValidation').css('visibility', 'hidden');

		// You can only use the sign on api with a username of phone number
		const data = {};
		if (formObject.username) data.username = formObject.username;
		else if (formObject.phone_number) data.phone_number = formObject.phone_number;

		// Reset the signon carousel
		vcSignonCarousel.carousel(vcSignonCarouselSlides.LOGGING_IN);
		// Open the signon modal
		vcSignonModal.modal('show');

		$.ajax({
			url: '/login/vc',
			method: 'POST',
			dataType: 'json',
			contentType: 'application/json',
			data: JSON.stringify(data)
		}).done((response) => {

			console.log(`Created VC login: ${JSON.stringify(response)}`);

			const status_checker = setInterval(() => {
				$.ajax({
					url: '/login/vc/status',
					method: 'GET',
					dataType: 'json',
					contentType: 'application/json'
				}).done((response) => {
					console.log(`Signup status response: ${JSON.stringify(response)}`);
					const signup_status = response.vc_login.status;

					const REMOTE_LOGIN_STEPS = {
						CREATED: 'CREATED',
						ESTABLISHING_CONNECTION: 'ESTABLISHING_CONNECTION',
						CHECKING_CREDENTIAL: 'CHECKING_CREDENTIAL',
						FINISHED: 'FINISHED',
						STOPPED: 'STOPPED',
						ERROR: 'ERROR'
					};

					if (signup_status === REMOTE_LOGIN_STEPS.ERROR || signup_status === REMOTE_LOGIN_STEPS.STOPPED) {
						clearInterval(status_checker);
						vcSignonCarousel.carousel(vcSignonCarouselSlides.FAILED);
						let message = JSON.stringify(response);
						if (response.vc_login.error) {
							message = `Error: ${response.vc_login.error}, Reason: ${response.vc_login.reason}`;
						}
						console.error(`Failed to complete VC signon: ${message}`);
					} else if (signup_status === REMOTE_LOGIN_STEPS.FINISHED) {
						console.log('VC Signon successful.  Redirecting to account page');

						clearInterval(status_checker);
						// Redirect to account page.  The user's session should be logged in at this point.
						setTimeout(() => {
							window.location.href = '/account';
						}, 3000);

					} else {
						console.log('Not logged in yet');
					}

				}).fail((jqXHR, textStatus, errorThrown) => {

					vcSignonCarousel.carousel(vcSignonCarouselSlides.FAILED);
					console.error('Failed to check vc login status ', errorThrown, jqXHR.responseText);
					clearInterval(status_checker);
				});
			}, 4000);

		}).fail((jqXHR, textStatus, errorThrown) => {

			vcSignonCarousel.carousel(vcSignonCarouselSlides.FAILED);
			console.error('Failed to start VC login', errorThrown, jqXHR.responseText);
		});
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

	$('#signupNextButton').on('click', () => {

		console.log('Submit='+$('#signupForm').serialize());

		const formArray = $('#signupForm').serializeArray();
		const formObject = {};
		for (let i = 0; i < formArray.length; i++) {
			formObject[formArray[i]['name']] = formArray[i]['value'].trim();
		}
		console.log(`Signup info: ${JSON.stringify(formObject)}`);
		const username = formObject.username;
		const password = formObject.password;
		const phone_number = formObject.phone_number;
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
		$.ajax({
			url: '/signup',
			method: 'POST',
			dataType: 'json',
			contentType: 'application/json',
			data: JSON.stringify({
				password: password,
				username: username,
				phone_number: phone_number,
				agent_name: agent_name
			})
		}).done((response) => {
			console.log(`Signup response: ${JSON.stringify(response)}`);

			const status_checker = setInterval(() => {
				$.ajax({
					url: '/signup/status',
					method: 'GET',
					dataType: 'json',
					contentType: 'application/json'
				}).done((response) => {
					console.log(`Signup status response: ${JSON.stringify(response)}`);
					const signup_status = response.signup.status;
					if (signup_status === REMOTE_SIGNUP_STEPS.ESTABLISHING_CONNECTION || signup_status === REMOTE_SIGNUP_STEPS.CREATED) {
						vcSignupCarousel.carousel(vcSignupCarouselSlides.ESTABLISHING_CONNECTION);
					} else if (signup_status === REMOTE_SIGNUP_STEPS.CHECKING_CREDENTIAL) {
						vcSignupCarousel.carousel(vcSignupCarouselSlides.CHECKING_CREDENTIAL);
					} else if (signup_status === REMOTE_SIGNUP_STEPS.ISSUING_CREDENTIAL) {
						vcSignupCarousel.carousel(vcSignupCarouselSlides.ISSUING_CREDENTIAL);
					} else if (signup_status === REMOTE_SIGNUP_STEPS.FINISHED) {

						clearInterval(status_checker);

						// Redirect to account page.  The user's session should be logged in at this point.
						setTimeout(() => {
							window.location.href = '/account';
						}, 3000);
					} else if (signup_status === REMOTE_SIGNUP_STEPS.STOPPED) {
						clearInterval(status_checker);
						vcSignupCarousel.carousel(vcSignupCarouselSlides.NOT_ALLOWED);
					} else if (signup_status === REMOTE_SIGNUP_STEPS.ERROR) {
						clearInterval(status_checker);

						if (response.signup.error && response.signup.error === 'SIGNUP_USER_ALREADY_EXISTS') {
							vcSignupCarousel.carousel(vcSignupCarouselSlides.ALREADY_HAVE_WALLET);
						} else {
							vcSignupCarousel.carousel(vcSignupCarouselSlides.NOT_ALLOWED);
						}
					}
				}).fail((jqXHR, textStatus, errorThrown) => {

					console.error('Failed to check signup status ', errorThrown, jqXHR.responseText);
					vcSignupCarousel.carousel(vcSignupCarouselSlides.NOT_ALLOWED);
					clearInterval(status_checker);
				});
			}, 2000);

		}).fail((jqXHR, textStatus, errorThrown) => {

			console.error('Failed to create signup', errorThrown, jqXHR.responseText);
			vcSignupCarousel.carousel(vcSignupCarouselSlides.NOT_ALLOWED);
		});
	});
});