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

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const qs = require('qs');

const MIMETYPES = Object.freeze({
	bmp: {mime: 'image/bmp', description: 'Bitmap'},
	cod: {mime: 'image/cis-cod', description: 'compiled source code'},
	gif: {mime: 'image/gif', description: 'graphic interchange format'},
	ief: {mime: 'image/ief', description: 'image file'},
	jpe: {mime: 'image/jpeg', description: 'JPEG image'},
	jpeg: {mime: 'image/jpeg', description: 'JPEG image'},
	jpg: {mime: 'image/jpeg', description: 'JPEG image'},
	jfif: {mime: 'image/pipeg', description: 'JPEG file interchange format'},
	svg: {mime: 'image/svg+xml', description: 'scalable vector graphic'},
	tif: {mime: 'image/tiff', description: 'TIF image'},
	tiff: {mime: 'image/tiff', description: 'TIF image'},
	ras: {mime: 'image/x-cmu-raster', description: 'Sun raster graphic'},
	cmx: {mime: 'image/x-cmx', description: 'Corel metafile exchange image file'},
	ico: {mime: 'image/x-icon', description: 'icon'},
	pnm: {mime: 'image/x-portable-anymap', description: 'portable any map image'},
	pbm: {mime: 'image/x-portable-bitmap', description: 'portable bitmap image'},
	pgm: {mime: 'image/x-portable-graymap', description: 'portable graymap image'},
	png: {mime: 'image/png', description: 'portable network graphics'},
	ppm: {mime: 'image/x-portable-pixmap', description: 'portable pixmap image'},
	rgb: {mime: 'image/x-rgb', description: 'RGB bitmap'},
	xbm: {mime: 'image/x-xbitmap', description: 'X11 bitmap'},
	xpm: {mime: 'image/x-xpixmap', description: 'X11 pixmap'},
	xwd: {mime: 'image/x-xwindowdump', description: 'X-Windows dump image'},
});

/**
 * A CardRenderer provides functions for generating credential images from a user's data.
 * @interface CardRenderer
 */

/**
 * Generates the front of a credential.
 *
 * @async
 * @function
 * @name CardRenderer#createCardFront
 * @param {object} [user_data] Information that should be displayed on the front of the card.
 * @returns {Promise<string>} A promise that resolves to a string of the form `data:MIME_TYPE;base64,IMAGE_DATA`
 */

/**
 * Generates the back of a credential.
 *
 * @async
 * @function
 * @name CardRenderer#createCardBack
 * @param {object} [user_data] Information that should be displayed on the back of the card.
 * @returns {Promise<string>} A promise that resolves to a string of the form `data:MIME_TYPE;base64,IMAGE_DATA`
 */

/**
 * PlaceHolderBrander will return static, predefined sample images for any card image requests.  It's intended to serve
 * as a testing tool.
 * @class
 * @implements {CardRenderer}
 */
class PlaceHolderBrander {

	/**
	 * The PlaceHolderBrander will return the card images passed in here for every call to createCardFront() and
	 * createCardBack().
	 * @param {string} front_card_image The path to an image file.
	 * @param {string} back_card_image The path to an image file
	 */
	constructor (front_card_image, back_card_image) {
		if (!front_card_image || typeof front_card_image !== 'string')
			throw new TypeError('PlaceHolderBrander front card image must be a path to an image file');
		if (!back_card_image || typeof back_card_image !== 'string')
			throw new TypeError('PlaceHolderBrander back card image must be a path to an image file');

		[ front_card_image, back_card_image ].every((image_path) => {
			// Make sure the card is an image
			const ext = path.extname(image_path).toLowerCase().substring(1); // Remove the period in the extension
			if (!ext || !Object.keys(MIMETYPES).includes(ext))
				throw new Error (`File ${image_path} is not an image! Must be one of ${JSON.stringify(Object.keys(MIMETYPES))}`);

			// Make sure the image exists
			if (!fs.existsSync(image_path))
				throw new Error(`File ${image_path} does not exist`);
		});

		this.front_card_image_path = front_card_image;
		this.back_card_image_path = back_card_image;
	}

	async createCardFront (user_data) {
		return read_card_image_file(this.front_card_image_path);
	}

	async createCardBack (user_data) {
		return read_card_image_file(this.back_card_image_path);
	}
}

/**
 * Reads in the given image file as a base64 image data string.
 * @param {string} image_path The path to an image file
 * @return {Promise<string>} A promise that resolves to a string of the form `data:MIME_TYPE;base64,IMAGE_DATA`
 */
async function read_card_image_file (image_path) {
	const ext = path.extname(image_path).toLowerCase().substring(1); // Remove the period in the extension
	const file = new Promise((resolve, reject) => {
		fs.readFile(image_path, (error, data) => {
			if (error) reject(error);
			else resolve(data);
		});
	});
	const data = Buffer.from(await file).toString('base64');
	return `data:${MIMETYPES[ext].mime};base64,${data}`;
}

/**
 * Calls out to a server that generates 'real' credential images from a user's data.
 * @class
 * @implements {CardRenderer}
 */
class BrandingServerRenderer {

	constructor (branding_server_url, front_template, back_template) {
		if (!branding_server_url || typeof branding_server_url !== 'string')
			throw new TypeError('Branding server url wast not a string');
		if (!front_template || typeof front_template !== 'string')
			throw new TypeError('Template ID for the front card image was not supplied');
		if (!back_template || typeof back_template !== 'string')
			throw new TypeError('Template ID for the back card image was not supplied');

		this.branding_server_url = branding_server_url;
		this.front_template = front_template;
		this.back_template = back_template;
	}

	async createCardFront (user_data) {
		if (typeof user_data !== 'object')
			throw new TypeError('User data was not provided');
		return await request_card_image(this.branding_server_url, this.front_template, user_data);
	}

	async createCardBack (user_data) {
		if (typeof user_data !== 'object')
			throw new TypeError('User data was not provided');
		return await request_card_image(this.branding_server_url, this.back_template, user_data);
	}
}

/**
 * Requests a rendered credential image from a branding server.
 * @param {string} server_url A url to a branding server.
 * @param {string} template_name A template ID that is deployed on the branding server.
 * @param {object} user_data A list of key value pairs representing the fields for the credential.
 * @return {Promise<string>} A Promise that returns an image data string (ex. 'data:image/jpg:base64,blahblahblah')
 */
async function request_card_image (server_url, template_name, user_data) {
	// Filter out spaces from field names
	const form = {};
	for (const key in user_data) {
		const underscored_key = key.replace(/\s/g, '_');
		form[underscored_key] = user_data[key];
	}
	form.brand = template_name;
	// signature is a keyword in the branding server api, don't use it in schemas for now
	delete form.signature;
	const options = {
		method: 'POST',
		url: server_url,
		headers: {
			'cache-control': 'no-cache',
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		data: qs.stringify(form)
	};

	let response = await axios(options);
	let body = response.data.replace(/(\r\n|\n|\r)/gm, '');
	return body;
}

/**
 * A placeholder renderer that just returns empty strings for all credential images
 * @class
 * @implements {CardRenderer}
 */
class NullRenderer {
	async createCardFront () {
		return '';
	}
	async createCardBack () {
		return '';
	}
}


/**
 * An ImageProvider provides functions for generating base64 strings from images.
 * @interface ImageProvider
 */

/**
 * Generates the back of a credential.
 *
 * @function
 * @name ImageProvider#getImage
 * @param {string|object} [id] Information that identifies an image, such as a file path.
 * @returns {Promise<string>} A promise that resolves to a string of the form `data:MIME_TYPE;base64,IMAGE_DATA`
 */

/**
 * StaticFileImageProvider will return static, predefined images for any image request.
 * @class
 * @implements {ImageProvider}
 */
class StaticFileImageProvider {

	/**
	 * The StaticFileImageProvider will return the given image for any call to getImage()
	 * @param {string} image_path The path to an image file.
	 */
	constructor (image_path) {
		if (!image_path || typeof image_path !== 'string')
			throw new TypeError('PlaceHolderBrander front card image must be a path to an image file');

		// Make sure the card is an image
		const ext = path.extname(image_path).toLowerCase().substring(1); // Remove the period in the extension
		if (!ext || !Object.keys(MIMETYPES).includes(ext))
			throw new Error (`File ${image_path} is not an image! Must be one of ${JSON.stringify(Object.keys(MIMETYPES))}`);

		// Make sure the image exists
		if (!fs.existsSync(image_path))
			throw new Error(`File ${image_path} does not exist`);

		this.image_path = image_path;
	}

	async getImage () {
		return read_card_image_file(this.image_path);
	}
}

/**
 * NullImageProvider returns an empty string for any image requests.
 *
 * @class
 * @implements {ImageProvider}
 */
class NullImageProvider {
	async getImage () {
		return '';
	}
}

module.exports = {
	PlaceHolderBrander,
	BrandingServerRenderer,
	NullRenderer,
	read_card_image_file,
	StaticFileImageProvider,
	NullImageProvider
};