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

	$('#refreshUsersButton').click(() => {
		populate_user_table();
	});

	$('#refreshSchemaButton').click(() => {
		getSchemaList();
	});

	$('#refreshCredDefsButton').click(() => {
		getCredDefs();
	});

	// Make sure new users are being given the password we think they are
	$('#createUserPassword, #createUserConfirmPassword').on('keyup', () => {
		if ($('#createUserPassword').val() === $('#createUserConfirmPassword').val()) {
			$('#createUserPasswordMessage').html('Matching').css('color', 'green');
		} else {
			$('#createUserPasswordMessage').html('Not Matching').css('color', 'red');
		}
	});

	$('#createUserForm').submit((event) => {
		console.log('Submit='+$('#createUserForm').serialize());
		event.preventDefault();

		let userEmail = $('#createUserEmail');
		userEmail.val(userEmail.val().trim());	//trim ws
		userEmail = userEmail.val();

		const formArray = $('#createUserForm').serializeArray();
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

		if (formObject.password !== formObject.confirm_password)
			return console.error('Passwords must match!');

		const password = formObject.password;
		delete formObject.password;
		delete formObject.confirm_password;

		const opts = {
			agent_name: formObject.agent_name
		};
		delete formObject.agent_name;

		// Start the loading animation
		const loader = $('#createUserButton');
		loader.html(loader.data('loading-text'));
		loader.attr('disabled', 'disabled');

		const data = JSON.stringify({
			personal_info: formObject,
			opts: opts,
			password: password
		});

		console.log(`Creating user ${userEmail} with request data ${JSON.stringify(data, 0, 1)}`);
		$.ajax({
			url: `/api/users/${userEmail}`,
			method: 'POST',
			dataType: 'json',
			contentType: 'application/json',
			data: data
		}).done((user) => {

			// Stop the loader
			loader.html(loader.data('original-text'));
			loader.removeAttr('disabled');

			console.log(`Created user ${userEmail}: ${JSON.stringify(user)}`);
			populate_user_table();

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
			$('#createUserAlert').html(window.alertHTML(alertText));
		});
	});

	/**
	 * Click handler for the "edit user" buttons in the user table
	 */
	$('#userTable').on('click', '.edit-user', (event) => {
		const target = $(event.target);

		const userID = target.attr('data-user');
		window.location.href = '/users/'+userID+'/edit';
	});


	/**
	 * Click handler for the "delete user" buttons in the user table
	 */
	$('#userTable').on('click', '.delete-user', (event) => {
		const target = $(event.target);

		const userID = target.attr('data-user');

		if (!confirm(`Are you sure you want to delete all records of ${userID}?`))
			return;

		// Start the loader
		target.html(target.data('loading-text'));
		target.attr('disabled', 'disabled');
		console.log(`Deleting user ${userID}`);

		$.ajax({
			url: `/api/users/${userID}`,
			method: 'DELETE'
		}).done(() => {

			// Stop the loader
			target.html(target.data('original-text'));
			target.removeAttr('disabled');

			console.log(`Deleted user ${userID}`);

			// Probably a good idea to refresh the table at this point.
			populate_user_table();

		}).fail((jqXHR, textStatus, errorThrown) => {

			// Stop the loader
			target.html(target.data('original-text'));
			target.removeAttr('disabled');

			console.error('Failed to delete user:', errorThrown, jqXHR.responseText);
			let alertText = `Failed to delete user. status: ${textStatus}, error: ${errorThrown}, jqXHR:${JSON.stringify(jqXHR)}`;
			if (jqXHR.responseJSON && jqXHR.responseJSON.reason) {
				const response = jqXHR.responseJSON;
				alertText = `Failed to delete user. <strong>error</strong>: ${response.error}, <strong>reason</strong>: ${response.reason}`;
			}
			$('#userTableAlert').html(window.alertHTML(alertText));
		});
	});

	/**
	 * Click handler for the "publish cred def" buttons in the user table
	 */
	$('#schemaTable').on('click', '.publish-cred-def', (event) => {
		const target = $(event.target);

		const schema_id = target.attr('data-schema-id');

		// Start the loader
		target.html(target.data('loading-text'));
		target.attr('disabled', 'disabled');

		const data = {
			schema_id: schema_id,
		};
		console.log(`Publishing cred def for schema ${schema_id}`);

		$.ajax({
			url: '/api/creddefs',
			method: 'POST',
			dataType: 'json',
			json: true,
			data: data
		}).done((resp) => {

			// Stop the loader
			target.html(target.data('original-text'));
			target.removeAttr('disabled');

			console.log(`Published credential definition as id ${resp.cred_def.id}`);

			// Probably a good idea to refresh the table at this point.
			getCredDefs();

		}).fail((jqXHR, textStatus, errorThrown) => {

			// Stop the loader
			target.html(target.data('original-text'));
			target.removeAttr('disabled');

			console.error('Failed to publish credential definition:', errorThrown, jqXHR.responseText);
			let alertText = `Failed to publish credential definition. status: ${textStatus}, error: ${errorThrown}, jqXHR:${JSON.stringify(jqXHR)}`;
			if (jqXHR.responseJSON && jqXHR.responseJSON.reason) {
				const response = jqXHR.responseJSON;
				alertText = `Failed to publish credential definition. <strong>error</strong>: ${response.error}, <strong>reason</strong>: ${response.reason}`;
			}
			$('#schemaAlert').html(window.alertHTML(alertText));
		});
	});

	// Get the default template when clicking the create schema button
	let schema_template;
	$('#openSchemaModalButton').on('click', () => {

		// Start the loading animation
		const loader = $('#openSchemaModalButton');
		loader.html(loader.data('loading-text'));
		loader.attr('disabled', 'disabled');

		console.log('Getting this issuer\'s schema template');
		$.ajax({
			url: '/api/schema_templates/default',
			method: 'GET',
			contentType: 'application/json',
		}).done((response) => {

			// Stop the loader
			loader.html(loader.data('original-text'));
			loader.removeAttr('disabled');

			console.log(`Schema template: ${JSON.stringify(response.schema)}`);
			$('#schema_name').val(response.schema.name);
			$('#schema_version').val(response.schema.version);
			schema_template = response.schema;
			$('#newSchemaModal').modal('show');

		}).fail((jqXHR, textStatus, errorThrown) => {

			// Stop the loader
			loader.html(loader.data('original-text'));
			loader.removeAttr('disabled');

			console.error('Failed to get schema template', errorThrown, jqXHR.responseText);
			let alertText = `Failed to get schema template. status: ${textStatus}, error: ${errorThrown}, jqXHR:${JSON.stringify(jqXHR)}`;
			if (jqXHR.responseJSON && jqXHR.responseJSON.reason) {
				const response = jqXHR.responseJSON;
				alertText = `Failed to get schema template. <strong>error</strong>: ${response.error}, <strong>reason</strong>: ${response.reason}`;
			}
			$('#createUserAlert').html(window.alertHTML(alertText));
		});
	});

	$('#licenseSchemaForm').submit((event) => {
		event.preventDefault();

		// Start the loading animation
		const loader = $('#createSchemaButton');
		loader.html(loader.data('loading-text'));
		loader.attr('disabled', 'disabled');

		let schema_name = $('#schema_name');
		schema_name.val(schema_name.val().trim());	//trim ws
		schema_name = schema_name.val();

		let schema_version = $('#schema_version');
		schema_version.val(schema_version.val().trim());	//trim ws
		schema_version = schema_version.val();

		const schema_attributes = schema_template.attributes;

		const data = {
			name: schema_name,
			version: schema_version,
			attributes: schema_attributes
		};

		console.log(`Creating schema with data: ${JSON.stringify(data)}`);
		$.ajax({
			url: '/api/schemas',
			method: 'POST',
			dataType: 'json',
			contentType: 'application/json',
			data: JSON.stringify(data)
		}).done((resp) => {

			// Stop the loader
			loader.html(loader.data('original-text'));
			loader.removeAttr('disabled');
			$('#newSchemaModal').modal('hide');

			console.log(`Created schema ${resp.schema_id}`);
			getSchemaList();

		}).fail((jqXHR, textStatus, errorThrown) => {

			// Stop the loader
			loader.html(loader.data('original-text'));
			loader.removeAttr('disabled');
			$('#newSchemaModal').modal('hide');

			console.error(`Failed to create schema ${schema_name}`, errorThrown, jqXHR.responseText);
			let alertText = `Failed to create schema ${schema_name}. status: ${textStatus}, error: ${errorThrown}, jqXHR:${JSON.stringify(jqXHR)}`;
			if (jqXHR.responseJSON && jqXHR.responseJSON.reason) {
				const response = jqXHR.responseJSON;
				alertText = `Failed to create schema ${schema_name}. <strong>error</strong>: ${response.error}, <strong>reason</strong>: ${response.reason}`;
			}
			$('#schemaAlert').html(window.alertHTML(alertText));
		});
	});

	// Display a preview when a user selects a profile pic
	$('#createUserPortrait').on('change', () => {
		const file = $('#createUserPortrait')[0].files[0];
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

	populate_user_table();
	getSchemaList();
	getCredDefs();
});

/**
 * Pulls the full list of users and renders them as a Bootstrap Table.
 * @returns {void}
 */
function populate_user_table () {

	// Start the loading animation
	const loader = $('#refreshUsersButton');
	loader.html(loader.data('loading-text'));
	loader.attr('disabled', 'disabled');

	console.log('Refreshing the list of users');
	$.ajax({
		url: '/api/users',
		method: 'GET'
	}).done((users) => {

		// Stop the loader
		loader.html(loader.data('original-text'));
		loader.removeAttr('disabled');

		console.log(`Got a list of users: ${JSON.stringify(users)}`);

		const table = {
			columns: [
				{
					field: '_id',
					title: 'User Name',
					sortable: true,
					searchable: true,
					formatter: emailLinkFormatter
				},
				{
					field: 'actions',
					title: 'Actions',
					formatter: actionsFormatter
				}
			],
			sortName: '_id',
			search: true,
			pagination: true,
			data: []
		};

		for (const username in users.users) {
			table.data.push(users.users[username]);
		}

		/**
		 * Turns email addresses into a link to the user's account page
		 * @param {string} email A user's email address.
		 * @returns {string} HTML representing the value for the cell of the table.
		 */
		function emailLinkFormatter (email) {
			return `<a href="mailto:${email}">${email}</a>`;
		}

		/**
		 * Creates a button group to let admins interact with user records.
		 * @param {void} _ The value for the actions column of the current row.  Not used.
		 * @param {object} user_doc The value for the current row, which is a user record.
		 * @returns {string} The set of buttons for interacting with user records.
		 */
		function actionsFormatter (_, user_doc) {
			return `<div class="btn-group">
              <button type="button" class="btn btn-primary edit-user" data-user="${user_doc.email}" data-original-text="Edit" data-loading-text="<i class='fas fa-circle-notch fa-spin'></i> Loading">Edit</button>
			  <button type="button" class="btn btn-danger delete-user" data-user="${user_doc.email}" data-original-text="Delete" data-loading-text="<i class='fas fa-circle-notch fa-spin'></i> Deleting">Delete</button>
			</div>`;
		}

		const tokenTable = $('#userTable');
		tokenTable.bootstrapTable('destroy');
		tokenTable.bootstrapTable(table);

	}).fail((jqXHR, textStatus, errorThrown) => {

		// Stop the loader
		loader.html(loader.data('original-text'));
		loader.removeAttr('disabled');

		console.error('Failed to get users:', errorThrown, jqXHR.responseText);
		let alertText = `Failed to get users. status: ${textStatus}, error: ${errorThrown}, jqXHR:${JSON.stringify(jqXHR)}`;
		if (jqXHR.responseJSON && jqXHR.responseJSON.reason) {
			const response = jqXHR.responseJSON;
			alertText = `Failed to get users. <strong>error</strong>: ${response.error}, <strong>reason</strong>: ${response.reason}`;
		}
		$('#userTableAlert').html(window.alertHTML(alertText));
	});
}

/**
 * Gets the full list of schemas records from the schema database and displays them in a Bootstrap Table.
 * @returns {void}
 */
function getSchemaList () {
	// Start the loading animation
	const loader = $('#refreshSchemaButton');
	loader.html(loader.data('loading-text'));
	loader.attr('disabled', 'disabled');

	console.log('Refreshing the list of schemas');
	$.ajax({
		url: '/api/schemas',
		method: 'GET'
	}).done((schemas) => {
		console.log(`Got a list of schemas: ${JSON.stringify(schemas)}`);
		// The actual list is wrapper with a message
		if (schemas.schemas) schemas = schemas.schemas;

		// Stop the loader
		loader.html(loader.data('original-text'));
		loader.removeAttr('disabled');

		create_schema_table(schemas);

	}).fail((jqXHR, textStatus, errorThrown) => {

		// Stop the loader
		loader.html(loader.data('original-text'));
		loader.removeAttr('disabled');

		console.error('Failed to get schemas:', errorThrown, jqXHR.responseText);
		let alertText = `Failed to get schemas. status: ${textStatus}, error: ${errorThrown}, jqXHR:${JSON.stringify(jqXHR)}`;
		if (jqXHR.responseJSON && jqXHR.responseJSON.reason) {
			const response = jqXHR.responseJSON;
			alertText = `Failed to get schemas. <strong>error</strong>: ${response.error}, <strong>reason</strong>: ${response.reason}`;
		}
		$('#schemaAlert').html(window.alertHTML(alertText));
	});
}

/**
 * Draws the schema table using the given data.
 * @param {array} schemas An array of schema documents.
 * @returns {void}
 */
function create_schema_table (schemas) {
	const table = {
		columns: [
			{
				field: 'id',
				title: 'Schema ID',
				sortable: true,
				searchable: true
			},
			{
				field: 'name',
				title: 'Name',
				sortable: true,
				searchable: true
			},
			{
				field: 'version',
				title: 'Version',
				sortable: true,
				searchable: true
			},
			{
				field: 'actions',
				title: 'Actions',
				formatter: actionsFormatter
			}
		],
		sortName: 'id',
		sortOrder: 'desc',
		search: true,
		pagination: true,
		data: []
	};

	for (const index in schemas) {
		table.data.push(schemas[index]);
	}

	/**
     * Creates a button group to let admins interact with schema records.
     * @param {void} _ The value for the actions column of the current row.  Not used.
     * @param {object} schema_doc The value for the current row, which is a schema record.
     * @returns {string} The set of buttons for interacting with schema records.
     */
	function actionsFormatter (_, schema_doc) {
		return `<div class="btn-group">
				<button type="button" class="btn btn-primary publish-cred-def" data-schema-id="${schema_doc.id}" data-original-text="Publish Cred Def" data-loading-text="<i class='fas fa-circle-notch fa-spin'></i> Publishing">Publish Cred Def</button>
			</div>`;
	}

	const schemaTable = $('#schemaTable');
	schemaTable.bootstrapTable('destroy');
	schemaTable.bootstrapTable(table);
}

/**
 * Gets the full list of credential definitions records from the schema database and displays them in a Bootstrap Table.
 * @returns {void}
 */
function getCredDefs () {
	// Start the loading animation
	const loader = $('#refreshCredDefsButton');
	loader.html(loader.data('loading-text'));
	loader.attr('disabled', 'disabled');

	console.log('Refreshing the list of credential definitions');
	$.ajax({
		url: '/api/creddefs',
		method: 'GET'
	}).done((cred_defs) => {
		console.log(`Got a list of credential definitions: ${JSON.stringify(cred_defs)}`);
		// The actual list is wrapper with a message
		if (cred_defs.cred_defs) cred_defs = cred_defs.cred_defs;

		// Stop the loader
		loader.html(loader.data('original-text'));
		loader.removeAttr('disabled');

		create_cred_def_table(cred_defs);

	}).fail((jqXHR, textStatus, errorThrown) => {

		// Stop the loader
		loader.html(loader.data('original-text'));
		loader.removeAttr('disabled');

		console.error('Failed to get credential definitions:', errorThrown, jqXHR.responseText);
		let alertText = `Failed to get credential definitions. status: ${textStatus}, error: ${errorThrown}, jqXHR:${JSON.stringify(jqXHR)}`;
		if (jqXHR.responseJSON && jqXHR.responseJSON.reason) {
			const response = jqXHR.responseJSON;
			alertText = `Failed to get credential definitions. <strong>error</strong>: ${response.error}, <strong>reason</strong>: ${response.reason}`;
		}
		$('#credDefAlert').html(window.alertHTML(alertText));
	});
}

/**
 * Populates the credential definition table.
 * @param {array} cred_defs A list of objects representing credential definition records.
 * @returns {void}
 */
function create_cred_def_table (cred_defs) {
	const table = {
		columns: [
			{
				field: 'id',
				title: 'Credential Definition ID',
				sortable: true,
				searchable: true
			},
			{
				field: 'schema_id',
				title: 'Schema ID',
				sortable: true,
				searchable: true
			}
		],
		sortName: 'schema_id',
		sortOrder: 'desc',
		search: true,
		pagination: true,
		data: []
	};

	for (const cred_def_id in cred_defs) {
		const def = cred_defs[cred_def_id];
		table.data.push(def);
	}

	const credDefTable = $('#credDefTable');
	credDefTable.bootstrapTable('destroy');
	credDefTable.bootstrapTable(table);
}