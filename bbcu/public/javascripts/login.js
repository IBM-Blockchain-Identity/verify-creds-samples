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

const vcSignonCarouselSlides = {
	CREATED: 0,
	QR_CODE: 1,
	ESTABLISHING_CONNECTION: 2,
	CHECKING_CREDENTIAL: 3,
	SUCCEEDED: 4,
	FAILED: 5
};

const vcSignupCarouselSlides = {
	BEFORE_REGISTERING: 0,
	BEFORE_REGISTERING_MOBILE: 1,
	ENTER_USER_INFO: 2,
	ENTER_USER_INFO_MOBILE: 3,
	QRCODE: 4,
	COLLECTING_INFO: 5,
	ESTABLISHING_CONNECTION: 6,
	CHECKING_CREDENTIAL: 7,
	ISSUING_CREDENTIAL: 8,
	FINISHED: 9,
	NOT_ALLOWED: 10,
	ALREADY_HAVE_WALLET: 11
};

$(document).ready(() => {

	const loginCarousel = $('#loginCarousel');
	const loginCarouselSlides = {
		SELECT_PLATFORM: 0,
		BROWSER_WALLET_SIGN_ON: 1,
		MOBILE_WALLET_SIGN_ON: 2,
		USERPASS_SIGN_ON: 3,
		VC_SIGN_ON: 4,
		VC_SIGN_ON_MOBILE: 5
	};

	// Show the user id/password sign-on form if the user clicks on the traditional signin links
	$('.userpassLink').on('click', () => {
		loginCarousel.carousel(loginCarouselSlides.USERPASS_SIGN_ON);
	});

	// Show the digital wallet sign-on form if the appropriate links are clicked
	$('.vcSignonLink').on('click', () => {
		loginCarousel.carousel(loginCarouselSlides.VC_SIGN_ON);
	});

	// Show the digital wallet sign-on form if the appropriate links are clicked
	$('#browser-sign-on-button').on('click', () => {
		loginCarousel.carousel(loginCarouselSlides.BROWSER_WALLET_SIGN_ON);
	});

	// Show the digital wallet sign-on form if the appropriate links are clicked
	$('#mobile-sign-on-button').on('click', () => {
		loginCarousel.carousel(loginCarouselSlides.MOBILE_WALLET_SIGN_ON);
	});

	// Show the digital wallet sign-on form if the appropriate links are clicked
	$('#mobile-sign-on-button-login').on('click', async () => {
		await ProcessSignon(vcSignonModal, vcSignonCarousel, true);
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

	// Show the vc signon input labels when the user id form input is clicked
	$('#vcUserID').focus(() => {
		$('#vcUserIDLabel').css('visibility', 'visible');
	});
	$('#vcUserID').focusout(() => {
		if (!$('#vcUserID').val().trim())
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
	const vcSignonFormMobile = $('#vcSignonFormMobile');
	const vcSignonModal = $('#vcSignonModal');
	const vcSignonCarousel = $('#vcSignonCarousel');

	// Sign on using VCs with browser extension
	vcSignonForm.submit(async (event) => {
		await ProcessSignon(vcSignonModal, vcSignonCarousel);
	});

	// Sign on using VCs with mobile app
	vcSignonFormMobile.submit(async (event) => {
		await ProcessSignon(vcSignonModal, vcSignonCarousel, true);
	});

	const vcSignupModal = $('#vcSignupModal');
	const vcSignupCarousel = $('#vcSignupCarousel');

	// Open the signup modal if the user wants to signup for an account and keep it open
	$('.vcSignupBrowserLink').on('click', () => {
		vcSignupCarousel.carousel(vcSignupCarouselSlides.BEFORE_REGISTERING);
		vcSignupModal.modal({
			backdrop: 'static',
			keyboard: false
		});
	});

	// Open the signup modal if the user wants to signup for an account and keep it open
	$('.vcSignupMobileLink').on('click', () => {
		vcSignupCarousel.carousel(vcSignupCarouselSlides.BEFORE_REGISTERING_MOBILE);
		vcSignupModal.modal({
			backdrop: 'static',
			keyboard: false
		});
	});

	// Handle all the cancel buttons/links in the signup flow
	$('.vcSignupCancel').on('click', () => {
		vcSignupModal.modal('hide');
	});

	// Takes us from the "Creds you need" screen to the user signup form
	$('#credsNextButton').on('click', () => {
		$('#signupNextButton').removeAttr('disabled');
		vcSignupCarousel.carousel(vcSignupCarouselSlides.ENTER_USER_INFO);
	});

	// Takes us from the "Creds you need" screen to the user signup form
	//  For this qr code demo, commenting this our.  We don't want to require
	//  user to enter username, skip to showing the QR code
	//$('#credsNextButtonMobile').on('click', () => {
	//	$('#signupNextButtonMobile').removeAttr('disabled');
	//	vcSignupCarousel.carousel(vcSignupCarouselSlides.ENTER_USER_INFO_MOBILE);
	//});

	// Show the signup form input labels when the user is filling out the fields
	const signup_user = $('#signupUserID');
	const signup_user_label = $('label[for="signupUserID"]');
	const signup_password = $('#signupPassword');
	const signup_password_label = $('label[for="signupPassword"]');
	const signup_confirm_password = $('#signupConfirmPassword');
	const signup_confirm_password_label = $('label[for="signupConfirmPassword"]');
	const signup_invitation_url = $('#signupInvitationURL');
	const signup_invitation_url_label = $('label[for="signupInvitationURL"]');

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
	signup_confirm_password.focus(() => {
		signup_confirm_password_label.css('visibility', 'visible');
	});
	signup_confirm_password.focusout(() => {
		if (!signup_confirm_password.val().trim())
			signup_confirm_password_label.css('visibility', 'hidden');
	});
	signup_invitation_url.focus(() => {
		signup_invitation_url_label.css('visibility', 'visible');
	});
	signup_invitation_url.focusout(() => {
		if (!signup_invitation_url.val().trim())
			signup_invitation_url_label.css('visibility', 'hidden');
	});

	// Make sure new users are being given the password we think they are
	const password_message = $('#signupPasswordMessage');
	$('#signupPassword, #signupConfirmPassword').on('keyup', () => {
		if (signup_password.val() === signup_confirm_password.val()) {
			if (signup_password.val().trim())
				password_message.html('Matching').css('color', 'green');
			else
				password_message.html('');
		} else {
			password_message.html('Not Matching').css('color', 'red');
		}
	});

	$('#signupNextButton').on('click', () => { ProcessSignup(vcSignupCarousel); });
	$('#credsNextButtonMobile').on('click', () => { ProcessSignup(vcSignupCarousel, true); });

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

async function ProcessSignon (vcSignonModal, vcSignonCarousel, mobileCredMgr=false) {
	event.preventDefault();

	let form = null;
	if (mobileCredMgr) {
		form = $('#vcSignonFormMobile');
	} else {
		form = $('#vcSignonForm');
	}
	console.log('Submit='+form.serialize());

	const formArray = form.serializeArray();
	const formObject = {};
	for (let i = 0; i < formArray.length; i++) {
		formObject[formArray[i]['name']] = formArray[i]['value'].trim();
	}
	console.log(`VC Sign in info: ${JSON.stringify(formObject)}`);

	// You can only use the sign on api with a username
	const data = {
		username: formObject.username
	};

	// Reset the signon carousel
	vcSignonCarousel.carousel(vcSignonCarouselSlides.CREATED);
	// Open the signon modal and keep it open
	vcSignonModal.modal({
		backdrop: 'static',
		keyboard: false
	});

	let qrCodeNonce = null;
	try {
		// Build a proof request using the latest cred defs from from
		//  ibmhr and govdmv
		let response = await $.ajax({
			url: '/login/proofschema',
			method: 'POST',
			dataType: 'json',
			contentType: 'application/json',
			data: {}
		});
		console.log(`Login proofschema response: ${JSON.stringify(response)}`);
		const verifierSchema = response.proof_schema;

		data['proof_schema_id'] = verifierSchema.id;
		if (mobileCredMgr) {
			// If the user selected for a signon for a mobile app, establish a
			//  connection and verification using a QR code rather than forcing
			//  the user to provide their invitation url
			qrCodeNonce = await displayProofQRCode(data.username, verifierSchema, 'connectionReqQRLogin');
			data['qr_code_nonce'] = qrCodeNonce;
		}

		response = await $.ajax({
			url: '/login/vc',
			method: 'POST',
			dataType: 'json',
			contentType: 'application/json',
			data: JSON.stringify(data)
		});

		console.log(`Created VC login: ${JSON.stringify(response)}`);

		let tries_left = 300;
		const interval = 4000; // milliseconds
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
				CREATED: vcSignonCarouselSlides.CREATED,
				WAITING_FOR_OFFER: vcSignonCarouselSlides.QR_CODE,
				ESTABLISHING_CONNECTION: vcSignonCarouselSlides.ESTABLISHING_CONNECTION,
				CHECKING_CREDENTIAL: vcSignonCarouselSlides.CHECKING_CREDENTIAL,
				FINISHED: vcSignonCarouselSlides.SUCCEEDED,
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
				return;
			}

			if ([ 'STOPPED', 'ERROR' ].indexOf(response.status) >= 0) {
				break;
			}

			if (use_extension) {
				// TODO render the connection offer as a QR code
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

	} catch (error) {
		if (error.code)
			$('#loginErrorCode').html(`Code: ${error.code}`);
		$('#loginErrorMessage').html(`Reason: ${error.message}`);

		vcSignonCarousel.carousel(vcSignonCarouselSlides.FAILED);
		console.error(`VC login failed: ${JSON.stringify(error)}`);
	}
}

async function ProcessSignup (vcSignupCarousel, mobileCredMgr=false) {

	let form = null;
	if (mobileCredMgr) {
		form = $('#signupFormMobile');
	} else {
		form = $('#signupForm');
	}
	console.log('Submit='+form.serialize());

	const formArray = form.serializeArray();
	const formObject = {};
	for (let i = 0; i < formArray.length; i++) {
		formObject[formArray[i]['name']] = formArray[i]['value'].trim();
	}
	console.log(`Signup info: ${JSON.stringify(formObject)}`);
	let username = null;
	if (mobileCredMgr) {
		username = '';
	} else {
		username = `${formObject.username.trim()}@example.com`;
	}
	const password = formObject.password ? formObject.password : null;
	const invitation_url = formObject.invitation_url ? formObject.invitation_url : null;

	if (formObject.password !== formObject.confirm_password)
		return console.error('Passwords must match!');

	const REMOTE_SIGNUP_STEPS = {
		CREATED: 'CREATED',
		WAITING_FOR_OFFER: 'WAITING_FOR_OFFER',
		ESTABLISHING_CONNECTION: 'ESTABLISHING_CONNECTION',
		CHECKING_CREDENTIAL: 'CHECKING_CREDENTIAL',
		ISSUING_CREDENTIAL: 'ISSUING_CREDENTIAL',
		FINISHED: 'FINISHED',
		STOPPED: 'STOPPED',
		ERROR: 'ERROR'
	};
	if (mobileCredMgr) {
		$('#signupNextButtonMobile').attr('disabled', 'disabled');
	} else {
		$('#signupNextButton').attr('disabled', 'disabled');
	}
	console.log(`Creating signup for user ${username}`);
	let qrCodeNonce = null;
	try {
		// Build a proof request using the latest cred defs from from
		//  ibmhr and govdmv
		let response = await $.ajax({
			url: '/signup/proofschema',
			method: 'POST',
			dataType: 'json',
			contentType: 'application/json',
			data: {}
		});
		console.log(`Signup proofschema response: ${JSON.stringify(response)}`);
		const verifierSchema = response.proof_schema;

		if (mobileCredMgr) {
			// If the user selected for a signon for a mobile app, establish a
			//  connection and verification using a QR code rather than forcing
			//  the user to provide their invitation url
			qrCodeNonce = await displayProofQRCode(username, verifierSchema, 'connectionReqQR');
		}

		// The user selected a "normal" signon, so needs to provide his/her
		//  agent url
		response = await $.ajax({
			url: '/signup',
			method: 'POST',
			dataType: 'json',
			contentType: 'application/json',
			data: JSON.stringify({
				password: password,
				username: username,
				invitation_url: invitation_url,
				proof_schema_id: verifierSchema.id,
				qr_code_nonce: mobileCredMgr ? qrCodeNonce: null,
			})
		});

		console.log(`Signup response: ${JSON.stringify(response)}`);

		let tries_left = 300;
		const interval = 4000; // milliseconds
		let verification_shown = false;
		let credential_shown = false;
		const running = true;

		// while running, check the signup status and switch the carousel slides
		//  ac
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

			if (signup_status === REMOTE_SIGNUP_STEPS.CREATED) {
				vcSignupCarousel.carousel(vcSignupCarouselSlides.COLLECTING_INFO);

			} else if (signup_status === REMOTE_SIGNUP_STEPS.WAITING_FOR_OFFER) {
				vcSignupCarousel.carousel(vcSignupCarouselSlides.QRCODE);

			} else if (signup_status === REMOTE_SIGNUP_STEPS.ESTABLISHING_CONNECTION || signup_status === REMOTE_SIGNUP_STEPS.CREATED) {
				vcSignupCarousel.carousel(vcSignupCarouselSlides.ESTABLISHING_CONNECTION);

			} else if (signup_status === REMOTE_SIGNUP_STEPS.CHECKING_CREDENTIAL) {
				vcSignupCarousel.carousel(vcSignupCarouselSlides.CHECKING_CREDENTIAL);

			} else if (signup_status === REMOTE_SIGNUP_STEPS.ISSUING_CREDENTIAL) {
				vcSignupCarousel.carousel(vcSignupCarouselSlides.ISSUING_CREDENTIAL);

			} else if (signup_status === REMOTE_SIGNUP_STEPS.FINISHED) {
				vcSignupCarousel.carousel(vcSignupCarouselSlides.FINISHED);

				// Redirect to account page.  The user's session should be logged in at this point.
				await new Promise((resolve, reject) => {
					setTimeout(resolve, 3000);
				});
				window.location.href = '/account';
				return;

			} else if (signup_status === REMOTE_SIGNUP_STEPS.STOPPED) {
				vcSignupCarousel.carousel(vcSignupCarouselSlides.NOT_ALLOWED);
				break;
			} else if (signup_status === REMOTE_SIGNUP_STEPS.ERROR) {
				if (response.error)
					$('#signupErrorCode').html(`Code: ${response.error}`);
				if (response.reason)
					$('#signupErrorMessage').html(`Reason: ${response.reason}`);

				if (response.error && response.error === 'USER_ALREADY_EXISTS') {
					vcSignupCarousel.carousel(vcSignupCarouselSlides.ALREADY_HAVE_WALLET);
				} else {
					vcSignupCarousel.carousel(vcSignupCarouselSlides.NOT_ALLOWED);
				}
				break;
			}

			if (use_extension) {
				// TODO render the connection offer as a QR code
				if (!verification_shown && response.verification && response.verification.id) {
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
				setTimeout(resolve, interval);
			});
		}

	} catch (error) {
		if (error.code)
			$('#signupErrorCode').html(`Code: ${error.code}`);
		$('#signupErrorMessage').html(`Reason: ${error.message}`);
		console.error(`Failed to create signup: ${JSON.stringify(error)}`);
		vcSignupCarousel.carousel(vcSignupCarouselSlides.NOT_ALLOWED);
	}
}

async function displayProofQRCode (username, verifierSchema, qrCodeParentId) {

	return new Promise(async (resolve, reject) => {
		try {
			if (username === undefined || username === null || typeof username !== 'string') {
				throw new TypeError('Invalid username was provided to displayProofQRCode');
			}
			if (!qrCodeParentId || typeof qrCodeParentId !== 'string') {
				throw new TypeError('Invalid qrCode parent element was provided to displayProofQRCode');
			}
			if (!verifierSchema || typeof verifierSchema !== 'object') {
				throw new Error('Verifier schema not found');
			}

			let response = null;

			// get the webapp's agent information
			response = await $.ajax({
				url: '/api/agentinfo',
				method: 'GET',
				dataType: 'json',
				contentType: 'application/json'
			});
			if (!response || !response.agent || !response.agent.url)
				throw new Error(`No agent information returned in response: ${JSON.stringify(response)}`);
			const verifierAgent = response.agent;

			// Find most current schema version
			console.log('Showing qrcode with connection+verification information');
			// Proof request
			// {
			// 	"type": "proof",
			// 	"data": {
			// 		"name": name,							UI USE ONLY
			// 		"nickname": nickname,					UI USE ONLY
			// 		"verifier": "https://alice:@124d...",
			// 		"proof_schema_id": "BBCU Account:1.0",
			//		"wait": true | false | null,
			//		"meta": {}
			// 	}
			// }
			const qrCodeNonce = window.makeid(20);
			const qrcodeContent = JSON.stringify({
				type: 'proof',
				data: {
					name: verifierAgent.user,
					nickname: verifierAgent.name,
					verifier: verifierAgent.invitation_url,
					proof_schema_id: verifierSchema.id,
					wait: false,
					meta: {
						nonce: qrCodeNonce,
						username: username
					}
				}
			});
			// cleanout any previous QR code
			const qrcodeParentNode = document.getElementById(qrCodeParentId);
			qrcodeParentNode.innerHTML = '';
			// show modal dialog with QR code for mobile app to scan
			new QRCode(document.getElementById(qrCodeParentId), {
				text: qrcodeContent,
				width: 400,
				height: 400,
				colorDark : '#000000',
				colorLight : '#ffffff',
				correctLevel : QRCode.CorrectLevel.L
			});

			return resolve(qrCodeNonce);
		} catch (error) {
			const message = `displayProofQRCode failed: ${error.message ? error.message : JSON.stringify(error)}`;
			console.error(message);
			return reject(`Failed to build QR cdoe.  Error: ${message}`);
		}
	});

}
