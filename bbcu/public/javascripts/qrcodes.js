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

	var account_url = $('#account_url').val();
	var user_id = $('#user_id').val();
	console.log("qrcodes.js: user id = " + user_id);
	console.log("qrcodes.js: account url = " + account_url);
	
	var typeNumber = 16;
	var quality = 'M';
	function getType(len) {
		if (len < 150) return 8;
		if (len < 300) return 13;
		if (len < 600) return 19;
		if (len < 900) return 24;
		if (len < 1200) return 29;
		if (len < 1500) return 32;
		if (len < 1800) return 35;
		if (len < 2200) return 40;
		throw new Error("Length of QR data > 2200, which is too long.");
	}

	$('#accountsNav').hide();
	$('#profileNav').hide();

	var data = 
		{
			"type": "connect",
			"data": {
				"name": "Big Blue Credit Union",
				"url": account_url
			}
		};
	console.log("Connection QR = " + JSON.stringify(data));
	try {
		var s = JSON.stringify(data);
		var qr = qrcode(getType(s.length), quality);
		qr.addData(s);
		qr.make();
		document.getElementById('connection_qrcode').innerHTML = qr.createImgTag(4);
		/*
		var canvas = document.getElementById('connection_qrcode')
		console.log(canvas)
		var qr = new QRious({
			//padding: 25,
			size: 300,
			element: canvas,
  			value: JSON.stringify(data)
		});
		*/
		//new QRCode(document.getElementById('connection_qrcode'), JSON.stringify(data));
	} catch (e) {
		console.error("Error: " + e);
	}

	data = 
		{
			"type": "credential",
			"data": {
				"name": "Big Blue Credit Union",
				"url": account_url,
				"schema_name": "BBCU Account",
				"schema_version": "1.1",
			}
		};
	console.log("Account Credential QR = " + JSON.stringify(data));
	try {
		var s = JSON.stringify(data);
		var qr = qrcode(getType(s.length), quality);
		qr.addData(JSON.stringify(data));
		qr.make();
		document.getElementById('account_credential_qrcode').innerHTML = qr.createImgTag(4);
		/*
		var canvas = document.getElementById('account_credential_qrcode')
		console.log(canvas)
		var qr = new QRious({
			//padding: 25,
			size: 300,
			element: canvas,
  			value: JSON.stringify(data)
		});
		*/
		//new QRCode(document.getElementById('account_credential_qrcode'), JSON.stringify(data));
	} catch (e) {
		console.error("Error: " + e);
	}

	data = 
		{
			"type": "credential",
			"data": {
				"name": "Big Blue Credit Union",
				"url": account_url,
				"schema_name": "Credit Score",
				"schema_version": "1.1",
			}
		};
	console.log("Credit Score Credential QR = " + JSON.stringify(data));
	try {
		var s = JSON.stringify(data);
		var qr = qrcode(getType(s.length), quality);
		qr.addData(JSON.stringify(data));
		qr.make();
		document.getElementById('credit_score_credential_qrcode').innerHTML = qr.createImgTag(4);
		/*
		var canvas = document.getElementById('credit_score_credential_qrcode')
		console.log(canvas)
		var qr = new QRious({
			//padding: 25,
			size: 300,
			element: canvas,
  			value: JSON.stringify(data)
		});
		*/
		//new QRCode(document.getElementById('credit_score_credential_qrcode'), JSON.stringify(data));
	} catch (e) {
		console.error("Error: " + e);
	}

	data = 
		{
			"type": "proof",
			"data": {
				"name": "Big Blue Credit Union",
				"url": account_url,
				"proof_schema_id": "Verify Employment:1.0",
				"wait": true
			}
		};
	console.log("Proof QR = " + JSON.stringify(data));
	try {
		var s = JSON.stringify(data);
		var qr = qrcode(getType(s.length), quality);
		qr.addData(JSON.stringify(data));
		qr.make();
		document.getElementById('employment_proof_qrcode').innerHTML = qr.createImgTag(4);
	} catch (e) {
		console.error("Error: " + e);
	}

	data = 
		{
			"type": "proof",
			"data": {
				"prover": account_url,
				"schema_name": "Mortgage Rates",
				"schema_version": "1.0",
				"wait": true
			}
		};
	console.log("Proof QR = " + JSON.stringify(data));
	try {
		var s = JSON.stringify(data);
		var qr = qrcode(getType(s.length), quality);
		qr.addData(JSON.stringify(data));
		qr.make();
		document.getElementById('rate_proof_qrcode').innerHTML = qr.createImgTag(4);
	} catch (e) {
		console.error("Error: " + e);
	}

	data = 
		{
			"type": "proof",
			"data": {
				"name": "Big Blue Credit Union",
				"url": account_url,
				"proof_schema_id": "BBCU Login Request:1.0",
				"wait": true
			}
		};
	console.log("Proof QR = " + JSON.stringify(data));
	try {
		var s = JSON.stringify(data);
		var qr = qrcode(getType(s.length), quality);
		qr.addData(JSON.stringify(data));
		qr.make();
		document.getElementById('login_proof_qrcode').innerHTML = qr.createImgTag(4);
	} catch (e) {
		console.error("Error: " + e);
	}

});

