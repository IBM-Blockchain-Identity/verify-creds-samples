/**
 © Copyright IBM Corp. 2019

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

/**
 * A helper function for generating a fading bootstrap alert.  Just helps me clean out the alert html in other parts of
 * the code.
 * @param {string} message What the alert should say.
 * @returns {string} HTML for a bootstrap alert.  Stick this in an element in your page somewhere.
 */
window.alertHTML = function (message) {
	return `<div class="alert alert-danger alert-dismissible fade show" role="alert">
		  ${message}
		  <button type="button" class="close" data-dismiss="alert" aria-label="Close">
		    <span aria-hidden="true">&times;</span>
		  </button>
		</div>`;
};

/**
 * Converts an email address into a mailto link if it's really an email.
 *
 * @param {string} email An email address or the name of a user.
 * @returns {string} A mailto link for the given email address, or the same user name that was passed in.
 */
window.emailParser = function (email) {
	if (email && email.indexOf('@') >= 0) {
		return `<a href="mailto:${email}">${email}</a>`;
	}
	return email;
};

/**
 * Reads a cookie.
 * @param {string} name The name of the cookie.
 * @returns {string|null} The content of the cookie.
 */
window.readCookie = function (name) {
	const nameEQ = name + '=';
	const ca = document.cookie.split(';');
	for (let i = 0; i < ca.length; i++) {
		let c = ca[i];
		while (c.charAt(0) === ' ') c = c.substring(1, c.length);
		if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
	}
	return null;
};

/**
 * Turns a timestamp into a pretty locale string.
 * @param {number} timestamp A timestamp.
 * @returns {string} A nice locale string for the timestamp.
 */
window.date_formatter = function (timestamp) {
	return new Date(timestamp).toLocaleString();
};
